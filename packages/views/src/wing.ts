import { centroid, finite, flipX, mirrored, previewBounds, type Point } from './geometry.ts';
import {
  ANCHOR_COLORS,
  ANCHOR_NAMES,
  frontPoint,
  ribProfile,
  type ProfileSections,
} from './profile.ts';
import { PreviewDrawing, type PreviewContext } from './scene.ts';

const NOTE = 'Input coordinates · Mirrored wing. Focus a rib row to highlight it.';

/** Section 1: the input planform or vault of both halves, the selected rib highlighted. */
export function geometryScene({ design, view, selected }: PreviewContext<'geometry'>) {
  if (view === 'front') {
    const d = new PreviewDrawing('Wing front view', NOTE);
    const half = design.geometry.ribs.flatMap((r, index) =>
      finite(r.xp) && finite(r.z) ? [{ index, number: r.number, point: [r.xp, r.z] as Point }] : [],
    );
    if (!half.length) d.label([0, 0], 'Enter rib X′ and Z coordinates to preview the vault');
    const ribs = mirrored(half, (r) => ({ ...r, point: flipX(r.point) }));
    const points = ribs.map((r) => r.point);
    const bounds = previewBounds(points);
    const center = centroid(points);
    const fontSize = (bounds.right - bounds.left) * 0.016;
    const radius = Math.max(bounds.right - bounds.left, 1) * 0.003;
    d.path(
      [
        [bounds.left, 0],
        [bounds.right, 0],
      ],
      'axis',
    );
    d.path(points, 'arch');
    for (const { index, number, point } of ribs)
      d.dot(
        point,
        radius * (index === selected ? 2 : 1),
        `Rib ${number} · X′ ${point[0]} · Z ${point[1]} cm`,
        index === selected,
        'point',
      );
    const numbers = half.map(({ index, point }) => ({
      index,
      point,
      direction: [point[0] - center[0], point[1] - center[1]] as Point,
    }));
    d.ribNumbers(numbers, fontSize, selected);
    return d.finish();
  }
  const d = new PreviewDrawing('Wing planform', NOTE);
  const half = design.geometry.ribs.flatMap((r, index) =>
    finite(r.x) && finite(r.yLE) && finite(r.yTE)
      ? [{ index, number: r.number, x: r.x, le: r.yLE, te: r.yTE }]
      : [],
  );
  if (!half.length)
    d.label([0, 0], 'Enter rib X and leading/trailing edge Y coordinates to preview the planform');
  const ribs = mirrored(half, (r) => ({ ...r, x: -r.x }));
  const outline = [
    ...ribs.map((r): Point => [r.x, r.le]),
    ...[...ribs].reverse().map((r): Point => [r.x, r.te]),
  ];
  const bounds = previewBounds(outline);
  const fontSize = (bounds.right - bounds.left) * 0.016;
  d.path(outline, 'outline', false, '', true);
  d.path(
    [
      [0, bounds.top],
      [0, bounds.bottom],
    ],
    'axis',
  );
  for (const r of ribs)
    d.path(
      [
        [r.x, r.le],
        [r.x, r.te],
      ],
      'rib',
      r.index === selected,
      `Rib ${r.number} · X ${r.x} · LE ${r.le} · TE ${r.te} cm`,
    );
  const numbers = half.map((r) => ({
    index: r.index,
    point: [r.x, r.te] as Point,
    direction: [0, r.te - r.le] as Point,
  }));
  d.ribNumbers(numbers, fontSize, selected);
  return d.finish();
}

/**
 * Sections 2 to 4: the planform or front projection of both halves, with
 * the anchor rows and, given a hole group, its ribs and hole centers.
 */
export function anchorsWingScene(
  context: PreviewContext<ProfileSections | 'holes'>,
  row: number,
  groupIndex?: number,
) {
  const { design, view, active } = context;
  const front = view === 'front';
  const group = groupIndex === undefined ? undefined : design.holes[groupIndex];
  const d = new PreviewDrawing(
    `Wing ${front ? 'front view' : 'planform'} with anchor positions`,
    group
      ? 'Highlighted ribs: selected hole group · Hollow dots: hole centers.'
      : 'Colored lines: active anchors. Focus a rib row to highlight it.',
  );
  d.legend.push(
    ...ANCHOR_NAMES.map((name, i) => ({
      text: name === 'F' ? 'F · brake' : name,
      color: ANCHOR_COLORS[i],
    })),
  );
  const project = (index: number, point: Point): Point | undefined => {
    if (front) return frontPoint(design, index, point);
    const r = design.geometry.ribs[index];
    if (!r || !finite(r.x) || !finite(r.yLE) || !finite(r.yTE)) return undefined;
    return [r.x, r.yLE + point[0] * (r.yTE - r.yLE)];
  };
  const half = design.geometry.ribs.flatMap((_, index) => {
    const leading = project(index, [0, 0]);
    const trailing = project(index, [1, 0]);
    if (!leading || !trailing) return [];
    const inGroup =
      !!group && index + 1 >= (group.firstRib ?? Infinity) && index + 1 <= (group.lastRib ?? -1);
    return [
      { index, leading, trailing, inGroup, profile: ribProfile(design, context.airfoils, index) },
    ];
  });
  const ribs = mirrored(half, (r) => ({
    ...r,
    leading: flipX(r.leading),
    trailing: flipX(r.trailing),
  }));
  const outline = [...ribs.map((r) => r.leading), ...[...ribs].reverse().map((r) => r.trailing)];
  // Each row of anchors, from the left tip: dots of adjacent ribs are joined.
  const series = ANCHOR_NAMES.map((name) =>
    [-1, 1].flatMap((side) =>
      (side < 0 ? [...half].reverse() : half).flatMap((r) => {
        const anchor = r.profile.anchors.find((a) => a.name === name);
        const point = anchor && project(r.index, [anchor.x, anchor.y]);
        return point
          ? [
              {
                index: r.index,
                percent: anchor.x * 100,
                point: [side * point[0], point[1]] as Point,
              },
            ]
          : [];
      }),
    ),
  );
  const holes = half
    .filter((r) => r.inGroup)
    .flatMap((r) =>
      (group?.holes ?? []).flatMap((hole, h) => {
        const [x, y] = hole.parameters;
        const point =
          [1, 3, 4].includes(hole.type) && finite(x) && finite(y)
            ? project(r.index, [x / 100, -y / 100])
            : undefined;
        return point
          ? [flipX(point), point].map((p) => ({ index: r.index, hole: h, point: p }))
          : [];
      }),
    );
  const bounds = previewBounds([
    ...outline,
    ...series.flat().map((dot) => dot.point),
    ...holes.map((hole) => hole.point),
  ]);
  const fontSize = (bounds.right - bounds.left) * 0.016;
  const radius = Math.max(bounds.right - bounds.left, 1) * 0.0025;

  d.path(outline, 'outline', false, '', true);
  for (const r of ribs)
    d.path(
      [r.leading, r.trailing],
      r.inGroup ? 'group-rib' : 'rib',
      r.index === row,
      `Rib ${r.index + 1}`,
    );
  series.forEach((dots, i) => {
    const path = dots
      .map(
        (dot, j) =>
          `${j && Math.abs(dot.index - dots[j - 1].index) <= 1 ? 'L' : 'M'}${dot.point.join(',')}`,
      )
      .join(' ');
    d.shape(
      path,
      dots.map((dot) => dot.point),
      'anchor-track',
      false,
      '',
      ANCHOR_COLORS[i],
    );
    for (const dot of dots)
      d.dot(
        dot.point,
        radius * (dot.index === row ? 1.8 : 1),
        `Rib ${dot.index + 1} · ${ANCHOR_NAMES[i]} · ${dot.percent}% chord`,
        dot.index === row,
        'anchor-dot',
        ANCHOR_COLORS[i],
      );
  });
  for (const hole of holes)
    d.dot(
      hole.point,
      radius,
      `Rib ${hole.index + 1} · Hole ${hole.hole + 1} center`,
      hole.hole === active,
      'hole-center',
    );
  const center = centroid(outline);
  const numbers = half.map((r) =>
    front
      ? {
          index: r.index,
          point: r.leading,
          direction: [r.leading[0] - center[0], r.leading[1] - center[1]] as Point,
        }
      : {
          index: r.index,
          point: r.trailing,
          direction: [r.trailing[0] - r.leading[0], r.trailing[1] - r.leading[1]] as Point,
        },
  );
  d.ribNumbers(numbers, fontSize, row);
  return d.finish();
}
