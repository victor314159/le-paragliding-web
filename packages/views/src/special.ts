import type { HvrHoleRow, LepAirfoil, LepDesign } from '@lepara/format';
import {
  flatToRib,
  holeOutline,
  ribAt,
  ribPoint,
  vRibHoles,
  type LineSections,
  type Point3,
  type VRib,
} from '@lepara/geometry';
import { finite, type Point } from './geometry.ts';
import { wingModel, type PreviewModel } from './model.ts';
import { SURFACE_COLORS } from './patterns.ts';
import { contourPoint, ribProfile, type ProfileSections } from './profile.ts';
import { profileSegment } from './rods.ts';
import { arcPoints, ellipsePoints, PreviewDrawing, type PreviewContext } from './scene.ts';
import { reinforcementModel } from './structure.ts';

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

/** A band down an inlet, from `from(u)` to `to(u)`. */
type Band = { readonly from: (u: number) => number; readonly to: (u: number) => number };

/** Points across a cell's inlet, and down it. */
const VENT_STEPS = 16;

/**
 * The closed part of an inlet of type `type`, in its normalized
 * coordinates (`ventBoundary`): bands from `from(u)` to `to(u)` down the
 * inlet, from its extrados end (0) to its intrados end (100), `u` across
 * from the left rib (0) to the right one (100). Positive types close the
 * extrados side of their boundary, negative ones the intrados side.
 */
function closedBands(type: number, parameters: readonly number[]): Band[] {
  const all = (v: number) => () => v;
  if (type === 1 || type === -1) return [{ from: all(0), to: all(100) }];
  if (Math.abs(type) === 6) {
    const [width, height] = parameters;
    if (!finite(width) || !finite(height)) return [];
    // Around an elliptic opening: above it and below it.
    const half = (u: number) => {
      const t = (u - 50) / (width / 2);
      return Math.abs(t) < 1 ? (height / 2) * Math.sqrt(1 - t * t) : 0;
    };
    return [
      { from: all(0), to: (u: number) => 50 - half(u) },
      { from: (u: number) => 50 + half(u), to: all(100) },
    ];
  }
  const boundary = [-2, -3, 4, -4, 5, -5].includes(type)
    ? ventBoundary(type, parameters).at(-1)
    : undefined;
  if (!boundary || boundary.length < 2) return [];
  const line = [...boundary].sort((a, b) => a[0] - b[0]);
  const at = (u: number) => contourPoint(line, u)?.[1] ?? Number.NaN;
  return [type > 0 ? { from: all(0), to: at } : { from: at, to: all(100) }];
}

/**
 * Section 26: the wing in 3D with the air inlets as glue vents make them
 * (§5.1, the drawing of the planform; the panels): row i the cell between
 * ribs i − 1 and i (rib 0 is rib 1 mirrored), each inlet open but for its
 * closed part, the fabric of the extrados or intrados panel, in its color,
 * up to the vent's boundary; across from rib to rib and down the inlet in
 * % of chord, both halves, the row `selected` highlighted.
 */
export function ventsModel(
  design: Pick<LepDesign, ProfileSections | 'glueVents'>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  selected: number,
): PreviewModel {
  const vents = design.glueVents;
  const model = wingModel(design, airfoils, { row: selected, inlets: vents.mode === 0 });
  model.title = 'Wing 3D model · air inlets';
  model.camera = [0.25, -1, 0.35];
  if (vents.mode === 0) {
    model.note = `Special glue vents are disabled: classic inlets, open in open cells. ${model.note}`;
    return model;
  }
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
  /** The rows of `band` on the inlet of `cell`, across it, if they all place. */
  const bandRows = (cell: number, { from, to }: Band): Point3[][] | undefined => {
    const rows: Point3[][] = [];
    for (let i = 0; i <= VENT_STEPS; i++) {
      const u = (100 * i) / VENT_STEPS;
      const [v0, v1] = [from(u), to(u)];
      if (!finite(v0) || !finite(v1)) return undefined;
      const row: Point3[] = [];
      for (let k = 0; k <= VENT_STEPS; k++) {
        const point = place(cell, [u, v0 + ((v1 - v0) * k) / VENT_STEPS]);
        if (!point) return undefined;
        row.push(point);
      }
      rows.push(row);
    }
    return rows;
  };
  const sides = [mirror, (p: Point3) => p];
  vents.ribs.forEach(({ type, parameters }, cell) => {
    if (!finite(type)) return;
    const color = type > 0 ? SURFACE_COLORS.extrados : SURFACE_COLORS.intrados;
    for (const band of closedBands(type, parameters)) {
      const rows = bandRows(cell, band);
      if (rows)
        for (const side of sides)
          model.surfaces.push({ rows: rows.map((row) => row.map(side)), kind: 'skin', color });
    }
    for (const points of ventBoundary(type, parameters)) {
      const placed = points.flatMap((p) => {
        const point = place(cell, p);
        return point ? [point] : [];
      });
      if (placed.length === points.length)
        for (const side of sides)
          model.lines.push({ points: placed.map(side), kind: 'vent', selected: cell === selected });
    }
  });
  model.legend = [
    { text: 'Closed · extrados panel', color: SURFACE_COLORS.extrados },
    { text: 'Closed · intrados panel', color: SURFACE_COLORS.intrados },
  ];
  model.note =
    'Each air inlet open but for its closed part, the fabric of the extrados or intrados ' +
    'panel up to the vent boundary, as the engine draws them: across from rib to rib and ' +
    'down the inlet in % of chord; the selected cell highlighted. At Wing scale, ribs placed ' +
    'as the engine places them, skin straight between ribs. Drag to rotate, scroll to zoom.';
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

/**
 * Section 27: the wing in 3D, its last rib highlighted, placed as the
 * engine places it: with the edge angles of the last cell (type 1), the
 * only type that reaches the 3D wing.
 */
export function wingTipModel(
  design: Pick<LepDesign, ProfileSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
): PreviewModel {
  const model = wingModel(design, airfoils, { row: design.geometry.ribs.length - 1 });
  const { mode } = design.wingTip;
  model.title = 'Wing 3D model · wing tip';
  model.note =
    (mode === 1
      ? 'The last cell with its edge angles, as the engine places it. '
      : mode === 2
        ? 'The rounded tip changes only the planform drawing: the engine places the ribs as input. '
        : mode === 4
          ? 'Engine 3.29 reads the last rib displacement and rotation but does not apply them. '
          : 'No special wing tip. ') + model.note;
  return model;
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

/** Whether `p` is inside the polygon `ring`. */
function insideRing(ring: readonly Point[], [x, y]: Point) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [[xi, yi], [xj, yj]] = [ring[i], ring[j]];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Where segment `p`–`q` crosses an edge of `ring`: the point and the edge's first vertex. */
function crossing(ring: readonly Point[], p: Point, q: Point) {
  for (let k = 0; k < ring.length; k++) {
    const [a, b] = [ring[k], ring[(k + 1) % ring.length]];
    const d = (q[0] - p[0]) * (b[1] - a[1]) - (q[1] - p[1]) * (b[0] - a[0]);
    if (!d) continue;
    const u = ((a[0] - p[0]) * (b[1] - a[1]) - (a[1] - p[1]) * (b[0] - a[0])) / d;
    const v = ((a[0] - p[0]) * (q[1] - p[1]) - (a[1] - p[1]) * (q[0] - p[0])) / d;
    if (u >= 0 && u <= 1 && v >= 0 && v <= 1)
      return { point: [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u] as Point, edge: k };
  }
  return undefined;
}

/**
 * The outline of a V-rib whose rows are numbered 0 to `last`, in its own
 * coordinates (row along it, fraction across), notched by the `holes` (in
 * the same coordinates) that overflow it, as the engine's may: where the
 * outline enters a hole, the hole's own outline inside the V-rib instead.
 */
function notchedOutline(last: number, holes: readonly (readonly Point[])[]): Point[] {
  const across = Array.from({ length: 11 }, (_, k) => k / 10);
  let outline: Point[] = [
    ...Array.from({ length: last + 1 }, (_, s): Point => [s, 0]),
    ...across.slice(1).map((t): Point => [last, t]),
    ...Array.from({ length: last }, (_, k): Point => [last - 1 - k, 1]),
    ...across.slice(1, -1).map((t): Point => [0, 1 - t]),
  ];
  const within = ([s, t]: Point) => s >= 0 && s <= last && t >= 0 && t <= 1;
  for (const hole of holes) {
    const start = outline.findIndex((p) => !insideRing(hole, p));
    if (start < 0) continue;
    const ring = [...outline.slice(start), ...outline.slice(0, start)];
    const result: Point[] = [];
    for (let i = 0; i < ring.length; i++) {
      if (!insideRing(hole, ring[i])) {
        result.push(ring[i]);
        continue;
      }
      let j = i;
      while (j + 1 < ring.length && insideRing(hole, ring[j + 1])) j++;
      const [enter, leave] = [
        crossing(hole, ring[i - 1], ring[i]),
        crossing(hole, ring[j], ring[(j + 1) % ring.length]),
      ];
      if (enter && leave) {
        // The hole's vertices from one crossing to the other, the way that stays in the V-rib.
        const n = hole.length;
        const forward = Array.from(
          { length: (leave.edge - enter.edge + n) % n },
          (_, k) => hole[(enter.edge + 1 + k) % n],
        );
        const backward = Array.from(
          { length: (enter.edge - leave.edge + n) % n },
          (_, k) => hole[(enter.edge - k + n) % n],
        );
        const way = forward.length && within(forward[forward.length >> 1]) ? forward : backward;
        result.push(enter.point, ...way, leave.point);
      }
      i = j;
    }
    outline = result;
  }
  return outline;
}

/**
 * Section 38: the V and VH ribs of section 12 in 3D, with the holes of
 * types 5 and 6 cut out of them as the engine cuts them on the V-ribs laid
 * flat (`vRibHoles`), carried onto each V-rib row by row: a hole that
 * overflows its V-rib, as the engine's may, notches it. The row `selected`
 * highlighted, if it is the one the engine keeps.
 */
export function hvrHolesModel(
  design: Pick<LepDesign, ProfileSections | LineSections | 'hvRibs' | 'hvrHoles'>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  selected: number,
): PreviewModel {
  // The V-ribs with holes by the first points of their edges, each hole in the V-rib's coordinates.
  const key = ([a, b]: VRib['edges']) => `${a[0].join()}/${b[0].join()}`;
  const holed = new Map(
    vRibHoles(design, airfoils).map((vrib) => [
      key(vrib.rib.edges),
      {
        vrib,
        holes: vrib.holes.map((hole) => ({
          row: hole.row,
          ring: holeOutline(hole).map((p) => flatToRib(vrib, p)),
        })),
      },
    ]),
  );
  const model = reinforcementModel(design, airfoils, -1, (rib) => {
    const entry = holed.get(key(rib.edges));
    if (!entry) return undefined;
    const { vrib, holes } = entry;
    const last = vrib.flat.left.length - 1;
    const fits = (ring: readonly Point[]) =>
      ring.every(([s, t]) => s >= 0 && s <= last && t >= 0 && t <= 1);
    const rings = holes.map(({ ring }) => ring);
    return {
      outline: notchedOutline(
        last,
        rings.filter((ring) => !fits(ring)),
      ).map((p) => ribAt(vrib, p)),
      holes: rings.filter(fits).map((ring) => ring.map((p) => ribAt(vrib, p))),
    };
  });
  model.title = 'Wing 3D model · HVR holes';
  for (const { vrib, holes } of holed.values())
    for (const { ring, row } of holes) {
      const points = [...ring, ring[0]].map((p) => ribAt(vrib, p));
      for (const side of [mirror, (p: Point3) => p])
        model.lines.push({ points: points.map(side), kind: 'hole', selected: row === selected });
    }
  model.note =
    'The holes of the type 5 and 6 V-ribs cut out as the engine cuts them on the V-ribs laid ' +
    'flat, from the last row of each type with holes, carried onto each V-rib row by row; one ' +
    'that overflows its V-rib, as the engine allows, notches it. The selected row highlighted ' +
    'if it is the one kept. Type 9 (miniribs) in the 2D view only. ' +
    model.note;
  return model;
}
