import type { HvrHoleRow, LepAirfoil, LepDesign } from '@lepara/format';
import { ribPoint, type Point3 } from '@lepara/geometry';
import { finite, type Point } from './geometry.ts';
import { wingModel, type PreviewModel } from './model.ts';
import { contourPoint, ribProfile, type ProfileSections } from './profile.ts';
import { profileSegment } from './rods.ts';
import { arcPoints, ellipsePoints, PreviewDrawing, type PreviewContext } from './scene.ts';

export function ventBoundary(type: number, parameters: readonly number[]): Point[][] {
  const top: Point[] = [
      [0, 0],
      [100, 0],
    ],
    bottom: Point[] = [
      [0, 100],
      [100, 100],
    ];
  if (type === 0) return [top, bottom];
  if (type === 1) return [bottom];
  if (type === -1) return [top];
  if (type === -2)
    return [
      top,
      [
        [0, 100],
        [100, 0],
      ],
    ];
  if (type === -3)
    return [
      top,
      [
        [0, 0],
        [100, 100],
      ],
    ];
  const [left, right, depth] = parameters;
  if (!finite(left) || !finite(right)) return [];
  if (Math.abs(type) === 6)
    return [type > 0 ? bottom : top, ellipsePoints([50, 50], left / 2, right / 2)];
  if (Math.abs(type) === 4 || Math.abs(type) === 5) {
    const a: Point = [0, 100 - left],
      b: Point = [100, 100 - right];
    if (Math.abs(type) === 5 && !finite(depth)) return [];
    return [
      type > 0 ? bottom : top,
      Math.abs(type) === 5 ? arcPoints(a, b, (type > 0 ? -1 : 1) * depth) : [a, b],
    ];
  }
  return [];
}

export function ventsScene({ design, selected }: PreviewContext<'glueVents'>) {
  const vents = design.glueVents;
  const row = vents.mode === 0 ? undefined : vents.ribs[selected];
  const type = vents.mode === 0 ? 0 : row?.type;
  const d = new PreviewDrawing(
    `Air inlet · rib ${selected + 1} · type ${type ?? '—'}`,
    'Normalized cell inlet: width and height 100% · Dashed frame: full inlet · Solid lines: vent boundaries.',
  );
  d.path(
    [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ],
    'baseline',
    false,
    '',
    true,
  );
  if (finite(type))
    for (const points of ventBoundary(type, row?.parameters ?? [])) d.path(points, 'vent', true);
  d.label([50, -10], 'Extrados side');
  d.label([50, 114], 'Intrados side');
  d.label([-4, 50], 'L', 'end');
  d.label([104, 50], 'R', 'start');
  const scene = d.finish();
  if (vents.mode === 0) scene.note += ' Special glue vents are disabled; classic inlet shown.';
  return scene;
}

const mirror = ([x, y, z]: Point3): Point3 => [-x, y, z];

/**
 * Section 26: the wing in 3D with the vent of each cell drawn on its air
 * inlet, as the engine draws them on the planform (§5.1): row i the cell
 * between ribs i − 1 and i (rib 0 is rib 1 mirrored), across from rib to
 * rib and from the extrados end of the inlet to its intrados end, in % of
 * chord; both halves, the row `selected` highlighted.
 */
export function ventsModel(
  design: Pick<LepDesign, ProfileSections | 'glueVents'>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  selected: number,
): PreviewModel {
  const model = wingModel(design, airfoils, { row: selected });
  model.title = 'Wing 3D model · air inlets';
  model.camera = [0.25, -1, 0.35];
  const vents = design.glueVents;
  /** The point at `v` % of rib `index`'s inlet, from its extrados end; -1 is the axis. */
  const inletPoint = (index: number, v: number): Point3 | undefined => {
    if (index < 0) {
      const p = inletPoint(0, v);
      return p && [-p[0], p[1], p[2]];
    }
    const { inlet } = ribProfile(design, airfoils, index).parts;
    if (inlet.length < 2) return undefined;
    const [from, to] = [inlet[0][0], inlet[inlet.length - 1][0]];
    const p = contourPoint(inlet, from + ((to - from) * v) / 100);
    return p && ribPoint(design, index, p);
  };
  const place = (cell: number, [u, v]: Point): Point3 | undefined => {
    const [a, b] = [inletPoint(cell - 1, v), inletPoint(cell, v)];
    const t = u / 100;
    return a && b && [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  };
  design.geometry.ribs.forEach((_, cell) => {
    const row = vents.mode === 0 ? undefined : vents.ribs[cell];
    const type = vents.mode === 0 ? 0 : row?.type;
    if (!finite(type)) return;
    const frame: Point[] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
      [0, 0],
    ];
    for (const [points, kind] of [
      [frame, 'baseline'],
      ...ventBoundary(type, row?.parameters ?? []).map((points) => [points, 'vent'] as const),
    ] as const) {
      const placed = points.flatMap((p) => {
        const point = place(cell, p);
        return point ? [point] : [];
      });
      if (placed.length !== points.length) continue;
      for (const side of [mirror, (p: Point3) => p])
        model.lines.push({
          points: placed.map(side),
          kind,
          selected: kind === 'vent' && cell === selected,
        });
    }
  });
  model.note =
    'The vent of each cell on its air inlet, as the engine draws them on the planform: ' +
    'across from rib to rib and down the inlet in % of chord; the selected cell highlighted' +
    (vents.mode === 0 ? '. Special glue vents are disabled: classic inlets. ' : '. ') +
    model.note;
  return model;
}

/** The same final-cell edge-angle and parabola formulas as the 3.29 planform drawing. */
export function wingTipOutline(design: Pick<LepDesign, 'geometry' | 'wingTip'>): {
  original: Point[];
  modified: Point[];
  note: string;
} {
  const ribs = design.geometry.ribs,
    tip = ribs.at(-1),
    previous = ribs.at(-2),
    mode = design.wingTip;
  if (
    !tip ||
    !previous ||
    ![tip.x, tip.yLE, tip.yTE, previous.x, previous.yLE, previous.yTE].every(finite)
  )
    return { original: [], modified: [], note: 'Two complete ribs are required.' };
  const original: Point[] = [
    [previous.x, previous.yLE],
    [tip.x, tip.yLE],
    [tip.x, tip.yTE],
    [previous.x, previous.yTE],
  ];
  if (mode.mode === 1 && finite(mode.angleLE) && finite(mode.angleTE)) {
    const span = tip.x - previous.x;
    return {
      original,
      modified: [
        [previous.x, previous.yLE],
        [tip.x, previous.yLE + span * Math.tan((mode.angleLE * Math.PI) / 180)],
        [tip.x, previous.yTE + span * Math.tan((mode.angleTE * Math.PI) / 180)],
        [previous.x, previous.yTE],
      ],
      note: 'Last-cell edge angles applied to the input planform.',
    };
  }
  if (mode.mode === 2 && finite(mode.distance) && finite(mode.angle)) {
    const dist = ((tip.yTE - tip.yLE) * mode.distance) / 100;
    const x1 = dist + tip.yLE - previous.yLE,
      y1 = tip.x - previous.x;
    // The source converts this angle on reading and converts it a second time here.
    const exponent =
      mode.angle === 0 ? x1 / (x1 - dist) : (x1 * Math.tan(mode.angle * (Math.PI / 180) ** 2)) / y1;
    if (x1 <= 0 || !finite(exponent) || exponent <= 0)
      return { original, modified: [], note: 'Parabola parameters do not define a finite curve.' };
    const points = Array.from({ length: 61 }, (_, i): Point => {
      const t = i / 60;
      return [tip.x - y1 * t ** exponent, tip.yLE + dist - x1 * t];
    }).reverse();
    return {
      original,
      modified: [...points, [tip.x, tip.yTE], [previous.x, previous.yTE]],
      note: 'Type 2 changes only the planform drawing. Distance is % of the last rib chord; angle follows the engine’s double conversion.',
    };
  }
  return {
    original,
    modified: mode.mode === 0 ? original : [],
    note: mode.mode === 0 ? 'Special wing tip is disabled.' : 'Complete the angle parameters.',
  };
}

export function wingTipScene(context: PreviewContext<ProfileSections | 'wingTip'>) {
  const { design } = context;
  const wingTip = design.wingTip;
  if (wingTip.mode === 4) {
    const index = design.airfoils.length - 1;
    const profile = ribProfile(design, context.airfoils, index);
    const d = new PreviewDrawing(
      'Last rib · requested displacement and rotation',
      'Engine 3.29 reads these parameters but does not apply them. Dashed: original input; solid: requested transform for illustration.',
    );
    const { displacement, rotation } = wingTip;
    d.path(profile.points, 'baseline');
    const chord = profile.chord;
    if (finite(displacement) && finite(rotation) && chord) {
      const angle = (rotation * Math.PI) / 180;
      const transformed = profile.points.map(([x, y]): Point => [
        x * Math.cos(angle) - y * Math.sin(angle),
        x * Math.sin(angle) + y * Math.cos(angle) - displacement / chord,
      ]);
      d.path(transformed, 'detail', true);
    }
    d.frame([
      [0, -0.15],
      [1, 0.15],
    ]);
    return d.finish();
  }
  const data = wingTipOutline(design);
  const d = new PreviewDrawing(
    'Wing tip · last cell planform',
    `Dashed: original · Solid: modified · Input geometry. ${data.note}`,
  );
  d.path(data.original, 'baseline', false, '', true);
  d.path(data.modified, 'detail', true, '', true);
  return d.finish();
}

/** Section 38 type 9 follows the source's width=a/b, center=displacement, offset=angle. */
export function miniribEllipses(row: HvrHoleRow, length: number, height: number) {
  if (
    ![row.holes, row.height, row.width, row.center, row.offset].every(finite) ||
    !Number.isInteger(row.holes) ||
    row.holes < 0 ||
    row.holes > 200
  )
    return [];
  return Array.from({ length: row.holes }, (_, i) => {
    const factor = (row.holes + 1 - i) / (row.holes + 2);
    const b = (factor * height * row.height) / 200;
    return {
      center: [1 - (factor + 0.05) * length, -factor * height * row.center] as Point,
      a: row.width * b,
      b,
      angle: (-row.offset * Math.PI) / 180,
    };
  });
}

export function hvrHolesScene(context: PreviewContext<ProfileSections | 'hvrHoles'>) {
  const { design, selected, rib } = context;
  const holes = design.hvrHoles;
  const row = holes.mode === 0 ? undefined : holes.rows[selected];
  const d = new PreviewDrawing(
    `Reinforcement holes · type ${row?.type ?? '—'}`,
    'Input hole parameters on a representative support. Final panel development and minirib ovalization require the engine.',
  );
  if (holes.mode === 0 || !row || row.drawn !== 1) {
    d.frame([
      [0, 0],
      [100, 60],
    ]);
    d.label(
      [50, 30],
      holes.mode === 0
        ? 'HVR holes are disabled'
        : row
          ? 'Hole output is disabled for this row'
          : 'Add an HVR holes row',
    );
    return d.finish();
  }
  if (row.type === 9) {
    const profile = ribProfile(design, context.airfoils, rib);
    const length = (design.airfoils[rib]?.minirib ?? 0) / 100;
    const start = 1 - length;
    const upper = profileSegment(profile.upper, 1, start),
      lower = profileSegment(profile.lower, start, 1);
    const u = contourPoint(profile.upper, start),
      l = contourPoint(profile.lower, start);
    d.path(profile.points, 'baseline');
    if (u && l && length > 0 && length < 1) {
      d.path([...upper, ...lower], 'profile', false, '', true);
      for (const hole of miniribEllipses(row, length, l[1] - u[1]))
        d.path(ellipsePoints(hole.center, hole.a, hole.b, hole.angle), 'hole', true, '', true);
    } else d.label([0.5, 0.16], 'Choose a rib with a minirib length between 1% and 100%');
    d.frame([
      [0, -0.12],
      [1, 0.2],
    ]);
    const scene = d.finish();
    scene.note +=
      ' Type 9: width is a/b, center is chord displacement, offset is rotation (degrees), as consumed by 3.29.';
    return scene;
  }
  const count = row.type === 5 || row.type === 15 ? design.anchors[rib]?.count : row.holes;
  d.path(
    [
      [0, 0],
      [100, 0],
      [100, 60],
      [0, 60],
    ],
    'profile',
    false,
    '',
    true,
  );
  if (
    finite(count) &&
    Number.isInteger(count) &&
    count >= 0 &&
    count <= 200 &&
    [row.height, row.width, row.center].every(finite)
  ) {
    const general = row.type === 6 || row.type === 16;
    for (let i = 0; i < count; i++) {
      const x = ((i + 1) * 100) / (count + 1),
        y = row.center * 60;
      const a = (60 * row.height) / 200;
      const b = general ? (100 * row.center) / (2 * Math.max(1, count)) : (60 * row.width) / 200;
      d.path(ellipsePoints([x, y], b, a), 'hole', true, `Hole ${i + 1}`, true);
    }
  }
  d.label([50, 75], 'Representative support · 100 × 60 units');
  const scene = d.finish();
  scene.note +=
    row.type === 6 || row.type === 16
      ? ' Types 6/16: the engine uses center/count for the width ratio; the entered width is overridden.'
      : ' Types 5/15: the engine places holes at anchors; the hole-count field is unused.';
  return scene;
}
