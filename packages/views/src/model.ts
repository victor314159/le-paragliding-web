import type { LepAirfoil, LepDesign } from '@lepara/format';
import type { GeometryResult } from '@lepara/preprocessor';
import { GENERIC_AIRFOIL } from './generic-airfoil.ts';
import { finite, holeOutline, mirrored, type Point } from './geometry.ts';
import {
  balloonedSkin,
  placeOnRib,
  ribPoint,
  type BalloonedPanel,
  type Point3,
  type SkinSections,
} from '@lepara/geometry/enhanced-v1';
import {
  ANCHOR_COLORS,
  ANCHOR_NAMES,
  contourPoint,
  profileSegment,
  ribProfile,
  type ProfileSections,
} from './profile.ts';
import type { TensionSurface } from './patterns.ts';
import type { PreviewScene } from './scene.ts';

/**
 * A 3D drawing in the engine's absolute coordinates (Z down). `surfaces`
 * are grids whose consecutive rows are joined, those with a `color` drawn
 * over the skin in it, `fills` planar outlines,
 * concave or not, with `holes`, and `dots` points; `kind` and `color` style them as in
 * `PreviewScene`. An `opening` gives where an item goes as the drawing
 * opens, point for point (a fill's rings: its outline, then its holes).
 */
export interface PreviewModel {
  title: string;
  note: string;
  surfaces: {
    rows: Point3[][];
    kind: string;
    color?: string;
    cutaway?: boolean;
    opening?: Opening<Point3[][]>;
  }[];
  fills: {
    points: Point3[];
    holes?: Point3[][];
    kind: string;
    color?: string;
    cutaway?: boolean;
    opening?: Opening<Point3[][]>;
  }[];
  dots: {
    point: Point3;
    kind: string;
    selected: boolean;
    color?: string;
    cutaway?: boolean;
    opening?: Opening<Point3>;
  }[];
  lines: {
    points: Point3[];
    kind: string;
    selected: boolean;
    color?: string;
    cutaway?: boolean;
    opening?: Opening<Point3[]>;
  }[];
  legend: PreviewScene['legend'];
  /** The direction the view looks from, when not the default one. */
  camera?: Point3;
  /** How far the drawing has opened, from 0 to 1, at each step of `opening`. */
  openingAt?: readonly number[];
  /** A grid on the table, its squares' `length` (cm), by pairs of points. */
  grid?: { length: number; lines: Point3[] };
  /** X bounds and fade width (cm) for surfaces and markings tagged for a skin cutaway. */
  cutaway?: { min: number; max: number; feather: number };
}

/** An item's steps from its place: moved apart, opening there, opened, its way on, then laid flat. */
export interface Opening<T> {
  readonly before: readonly T[];
  readonly apart: T;
  readonly between: readonly T[];
  readonly flat: T;
}

/** A right-half skin panel, sampled on the rendered mesh, with chord positions from TE. */
export interface SkinPanel {
  readonly cell: number;
  readonly surface: TensionSurface;
  readonly rows: readonly (readonly SkinVertex[])[];
}
export interface SkinVertex {
  readonly point: Point3;
  readonly span: number;
  readonly chord: number;
}

/**
 * Points per part of a rib section, from the trailing edge: the extrados to
 * the nose, then to the air inlet, the inlet and the intrados.
 */
const SAMPLES = [24, 10, 8, 24];
/** The columns of a section across the air inlet. */
const INLET = [SAMPLES[0] + SAMPLES[1] - 2, SAMPLES[0] + SAMPLES[1] + SAMPLES[2] - 3];

const mirror = ([x, y, z]: Point3): Point3 => [-x, y, z];

/** `count` points along a polyline, evenly by length, closer near its ends. */
function resample(points: readonly Point[], count: number): Point[] {
  const lengths = [0];
  for (let i = 1; i < points.length; i++)
    lengths.push(
      lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]),
    );
  const total = lengths[lengths.length - 1];
  if (!total) return points.length ? Array.from({ length: count }, () => points[0]) : [];
  let i = 1;
  return Array.from({ length: count }, (_, k): Point => {
    const target = total * (1 - Math.cos((Math.PI * k) / (count - 1))) * 0.5;
    while (i < points.length - 1 && lengths[i] < target) i++;
    const t = (target - lengths[i - 1]) / (lengths[i] - lengths[i - 1] || 1);
    const [a, b] = [points[i - 1], points[i]];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  });
}

/** The points that `place` places. */
const placeEach = (points: readonly Point[], place: (point: Point) => Point3 | undefined) =>
  points.flatMap((p) => {
    const point = place(p);
    return point ? [point] : [];
  });

/** The parts of a profile without air inlet, split at its nose. */
function noseParts(points: readonly Point[]): Point[][] {
  let nose = 0;
  points.forEach((p, i) => {
    if (p[0] < points[nose][0]) nose = i;
  });
  return [points.slice(0, nose + 1), points.slice(nose, nose + 1), points.slice(nose)];
}

/**
 * A rib in 3D: its contour, its section sampled alike on every rib and the
 * stations of its points, whether the cell on its outer side is open, and
 * its anchors.
 */
interface PlacedRib {
  readonly index: number;
  readonly contour: Point3[];
  readonly section?: Point3[];
  readonly stations: readonly number[];
  readonly open: boolean;
  readonly anchors: readonly { name: string; point?: Point3 }[];
}

/**
 * The rib `index` of profile `points` (x, -y), placed by `place`, a chord
 * without profile; its section along the parts of the profile the skin
 * covers: the extrados, the air inlet and the intrados, if any.
 */
function placedRib(
  index: number,
  points: readonly Point[],
  place: (point: Point) => Point3 | undefined,
  parts: readonly (readonly Point[])[],
  open = false,
  anchors: PlacedRib['anchors'] = [],
): PlacedRib | undefined {
  const contour = placeEach(
    points.length
      ? points
      : [
          [0, 0],
          [1, 0],
        ],
    place,
  );
  if (!contour.length) return undefined;
  // The extrados in two, at its nose, so that the samples gather there.
  const [extrados = [], ...rest] = parts;
  const [toNose, , fromNose] = noseParts(extrados);
  const sampled = [toNose, fromNose, ...rest].map((part, i) =>
    resample(part, SAMPLES[i]).slice(i ? 1 : 0),
  );
  const flat = sampled.flat();
  const section = placeEach(flat, place);
  const count = SAMPLES.slice(0, sampled.length).reduce((sum, n) => sum + n - 1, 1);
  const stations = flat.map(([x]) => x);
  return {
    index,
    contour,
    section: sampled.length > 2 && section.length === count ? section : undefined,
    stations,
    open,
    anchors,
  };
}

/** Adjacent ribs sampled at the same stations. */
type Run = { index: number; section: Point3[]; stations: readonly number[]; side: number }[];

/** Whether a ballooned panel is one of the extrados or intrados, which colors follow. */
const isSkinPanel = (panel: BalloonedPanel): panel is BalloonedPanel & SkinPanel =>
  panel.surface !== 'inlet';

/**
 * Both halves of a wing from its `half`: the ribs, the skin between
 * adjacent ribs, the `ballooned` right-hand panels or straight between ribs,
 * open at the air inlets of open cells, and the anchor rows; the rib `row`
 * highlighted, and the outlines of the `highlighted` ones.
 */
function assemble(
  half: readonly PlacedRib[],
  row: number,
  title: string,
  note: string,
  highlighted?: (index: number) => boolean,
  panels?: SkinPanel[],
  ballooned?: readonly BalloonedPanel[],
): PreviewModel {
  const lines: PreviewModel['lines'] = [];
  for (const rib of half)
    for (const side of [rib.contour.map(mirror), rib.contour])
      lines.push({
        points: side,
        kind: 'rib',
        selected: rib.index === row || !!highlighted?.(rib.index),
      });
  // Runs of adjacent ribs with a section, from the left tip: gaps split the skin.
  const runs: Run[] = [];
  let previous: number | undefined;
  for (const { index, section, stations, side } of mirrored(
    half.map((r) => ({ ...r, side: 1 })),
    (r) => ({
      ...r,
      section: r.section?.map(mirror),
      side: -1,
    }),
  )) {
    if (!section) previous = undefined;
    else {
      if (previous === undefined || Math.abs(index - previous) > 1) runs.push([]);
      runs[runs.length - 1].push({ index, section, stations, side });
      previous = index;
    }
  }
  const open = new Set(half.filter((r) => r.open).map((r) => r.index));
  const surfaces: PreviewModel['surfaces'] = [];
  for (const panel of ballooned ?? []) {
    const rows = panel.rows.map((row) => row.map((p) => p.point));
    surfaces.push(
      { rows, kind: 'skin' },
      { rows: rows.map((row) => row.map(mirror)), kind: 'skin' },
    );
  }
  panels?.push(...(ballooned ?? []).filter(isSkinPanel));
  for (const fullRun of ballooned ? [] : runs) {
    // The left skin is reflected below; only retain its central rib as a
    // boundary for the first right-hand cell.
    const firstRight = fullRun.findIndex((rib) => rib.side > 0);
    if (firstRight < 0) continue;
    const run = fullRun.slice(Math.max(0, firstRight - 1));
    if (run.length < 2) continue;
    // Draw each right-hand cell and its reflection. Colors use these same
    // triangles: reversing a left-hand grid would change its facet diagonals.
    for (let i = 1; i < run.length; i++) {
      const a = run[i - 1],
        b = run[i];
      const central = a.side < 0;
      for (const [surface, from, to] of [
        ['extrados', 0, INLET[0]],
        ['intrados', INLET[1], run[0].section.length - 1],
        ['inlet', INLET[0], INLET[1]],
      ] as const) {
        if (to <= from || (surface === 'inlet' && open.has(b.index))) continue;
        const sampled: SkinVertex[][] = [central ? 0.5 : 0, 1].map((t) =>
          Array.from({ length: to - from + 1 }, (_, n) => {
            const k = n + from,
              p = a.section[k],
              q = b.section[k];
            return {
              point: [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t],
              span: central ? 2 * t - 1 : t,
              chord: 100 * (1 - a.stations[k] - (b.stations[k] - a.stations[k]) * t),
            };
          }),
        );
        const right = sampled.map((row) => row.map((p) => p.point));
        surfaces.push(
          { rows: right, kind: 'skin' },
          { rows: right.map((row) => row.map(mirror)), kind: 'skin' },
        );
        if (surface !== 'inlet') panels?.push({ cell: b.index, surface, rows: sampled });
      }
    }
  }
  // The highlighted rib, filled.
  const fills: PreviewModel['fills'] = half
    .filter(({ index, contour }) => index === row && contour.length > 2)
    .flatMap(({ contour }) => [contour.map(mirror), contour])
    .map((points) => ({ points, kind: 'selected' }));
  // Each row of anchors, from the left tip: points of adjacent ribs are joined.
  const dots: PreviewModel['dots'] = [];
  ANCHOR_NAMES.forEach((name, i) => {
    const points = half.flatMap(({ index, anchors }) => {
      const point = anchors.find((a) => a.name === name)?.point;
      return point ? [{ index, point }] : [];
    });
    let track: Point3[] = [];
    let last: number | undefined;
    for (const { index, point } of mirrored(points, (p) => ({ ...p, point: mirror(p.point) }))) {
      if (last === undefined || Math.abs(index - last) > 1) {
        track = [];
        lines.push({
          points: track,
          kind: 'anchor-track',
          selected: false,
          color: ANCHOR_COLORS[i],
        });
      }
      track.push(point);
      last = index;
      dots.push({
        point,
        kind: 'anchor-dot',
        selected: index === row,
        color: ANCHOR_COLORS[i],
      });
    }
  });
  return {
    title,
    note: `${note} Drag to rotate, scroll to zoom.`,
    surfaces,
    fills,
    dots,
    lines,
    legend: dots.length
      ? ANCHOR_NAMES.map((name, i) => ({
          text: name === 'F' ? 'F · brake' : name,
          color: ANCHOR_COLORS[i],
        }))
      : [],
  };
}

/** A minirib in 3D: its row (its outer rib, from 0), outline and placement of its rib-local points. */
export interface PlacedMinirib {
  readonly row: number;
  readonly outline: Point3[];
  /** Its length (a fraction of chord) and its height where it starts, of its inner rib. */
  readonly length: number;
  readonly height: number;
  readonly place: (point: Point) => Point3 | undefined;
}

/**
 * The miniribs of section 2 in 3D, which the engine leaves out of its 3D
 * model: in the cell of each row whose minirib is above 1 and below 100 %
 * of chord (not on a single skin), the tail of its inner rib's airfoil from
 * the trailing edge, as the engine cuts it (§9), placed midway between the
 * cell's ribs (rib 0 is rib 1 mirrored).
 */
export function placedMiniribs(
  design: Pick<LepDesign, ProfileSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
): PlacedMinirib[] {
  if (design.geometry.paragliderType === 'ss') return [];
  return design.airfoils.flatMap((row, index): PlacedMinirib[] => {
    const length = row.minirib / 100;
    if (!(length > 0.01 && length < 1)) return [];
    const inner = Math.max(index - 1, 0);
    const profile = ribProfile(design, airfoils, inner);
    const start = 1 - length;
    const [top, bottom] = [contourPoint(profile.upper, start), contourPoint(profile.lower, start)];
    if (!top || !bottom) return [];
    // Midway between the cell's ribs, the inner one mirrored for the central cell.
    const place = (p: Point): Point3 | undefined => {
      const [a, b] = [ribPoint(design, inner, p), ribPoint(design, index, p)];
      if (!a || !b) return undefined;
      const x = index === 0 ? -a[0] : a[0];
      return [(x + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    };
    const outline = [
      ...profileSegment(profile.upper, 1, start),
      ...profileSegment(profile.lower, start, 1).slice(1, -1),
    ].map(place);
    if (!outline.every((p): p is Point3 => !!p)) return [];
    return [{ row: index, outline, length, height: bottom[1] - top[1], place }];
  });
}

/**
 * The wing at Wing scale, with its draft ribs and either straight skin or
 * the ported engine skin. Colors collect the same rendered mesh.
 */
export function wingModel(
  design: Pick<LepDesign, ProfileSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  {
    row = -1,
    anchors = false,
    skin,
    inlets = true,
    ribs,
    miniribs = true,
    panels,
  }: {
    row?: number;
    anchors?: boolean;
    skin?: readonly BalloonedPanel[];
    inlets?: boolean;
    ribs?: (index: number) => boolean;
    miniribs?: boolean;
    /** Optionally collect the rendered skin panels for layers that follow its surface. */
    panels?: SkinPanel[];
  } = {},
): PreviewModel {
  const single = design.geometry.paragliderType === 'ss';
  const half = design.geometry.ribs.flatMap((_, index) => {
    const profile = ribProfile(design, airfoils, index);
    const place = (point: Point) => ribPoint(design, index, point);
    const points = anchors
      ? profile.anchors.map((a) => ({ name: a.name, point: place([a.x, a.y]) }))
      : [];
    const { extrados, inlet, intrados } = profile.parts;
    // A single skin has no intrados, the engine meshing none (§21.10, 21.13).
    const parts = single ? [extrados, inlet] : [extrados, inlet, intrados];
    return (
      placedRib(index, profile.points, place, parts, profile.open === 1 || !inlets, points) ?? []
    );
  });
  // Drafts whose airfoils the engine cannot mesh alike keep a straight skin.
  const ballooned = skin?.length
    ? skin.filter((panel) => inlets || panel.surface !== 'inlet')
    : undefined;
  const model = assemble(
    half,
    row,
    ballooned ? 'Wing 3D model · ballooned skin' : 'Wing 3D model',
    'At Wing scale · Ribs placed as the engine places them. ' +
      (ballooned
        ? 'Skin ballooned by the enhanced model: the engine’s panel development and corrections, exact circular arcs and, on a double skin, section 2 miniribs.'
        : 'Skin straight between ribs: no ballooning or 3D shaping.') +
      (single
        ? ' Single skin: the skin over the extrados and air inlets only, as the engine meshes it.'
        : ''),
    ribs,
    panels,
    ballooned,
  );
  if (miniribs)
    for (const { outline } of placedMiniribs(design, airfoils))
      for (const side of [outline.map(mirror), outline])
        model.lines.push({ points: [...side, side[0]], kind: 'minirib', selected: false });
  return model;
}

/** Sections 5 and 31: the engine's panel development, corrections and skin tessellation. */
export function tensionModel(
  design: Pick<LepDesign, ProfileSections | SkinSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
): PreviewModel {
  const skin = balloonedSkin(design, airfoils);
  const model = wingModel(design, airfoils, { skin });
  if (design.skinTensionGroups.mode !== 0 && skin.length)
    model.note = `Section 31 is active and replaces these overwidths: each panel edge ballooned by its rib's group there. ${model.note}`;
  return model;
}

/**
 * Section 31: the wing in 3D, its skin ballooned by the overwidths of the
 * groups, as the engine adds them (§8.2): on each panel edge those of the
 * rib's group (the last that names it), rib 0 those of rib 1; with groups
 * disabled, those of section 5. The first and last ribs of group `selected`
 * highlighted.
 */
export function tensionGroupsModel(
  design: Pick<LepDesign, ProfileSections | SkinSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  selected: number,
): PreviewModel {
  const tension = design.skinTensionGroups;
  if (tension.mode === 0) {
    const model = tensionModel(design, airfoils);
    model.note = `Skin tension groups are disabled: section 5's overwidths. ${model.note}`;
    return model;
  }
  const group = tension.groups[selected];
  const skin = balloonedSkin(design, airfoils);
  const model = wingModel(design, airfoils, {
    skin,
    // The last rib may be the virtual one past the tip, nribss + 1.
    ribs: (index) =>
      !!group &&
      (index + 1 === group.firstRib ||
        index + 1 === Math.min(group.lastRib, design.geometry.ribs.length)),
  });
  model.title = `Wing 3D model · skin tension group ${group?.group ?? '—'}`;
  model.note =
    (skin.length
      ? "Each panel edge ballooned by its rib's group; ribs in no group without overwidth. "
      : '') +
    "The selected group's first and last ribs highlighted. " +
    model.note;
  return model;
}

/**
 * Rib `index` placed in 3D, with `holes` placed on it, a cutout per hole
 * (fewer than three points when it cannot be drawn); undefined without a contour.
 */
export function holedRib(
  design: Pick<LepDesign, ProfileSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  index: number,
  holes: LepDesign['holes'][number]['holes'],
): { contour: Point3[]; cutouts: Point3[][] } | undefined {
  const place = (point: Point) => ribPoint(design, index, point);
  const contour = placeEach(ribProfile(design, airfoils, index).points, place);
  if (contour.length < 3) return undefined;
  return {
    contour,
    cutouts: holes.map((hole) => placeEach(holeOutline(hole)?.points ?? [], place)),
  };
}

/**
 * Section 4: the wing with the ribs of hole group `group` filled, its holes
 * cut out and the hole `active` outlined.
 */
export function holesModel(
  design: Pick<LepDesign, ProfileSections | 'holes'>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  group: number,
  active: number,
): PreviewModel {
  const model = wingModel(design, airfoils);
  const holes = design.holes[group];
  model.title = `Wing 3D model · hole group ${group + 1}`;
  model.note =
    'Filled: the ribs of the selected group, holes cut out, the focused hole outlined. ' +
    'Triangle and trapezoid holes without their rounded corners. ' +
    model.note;
  if (!holes || !finite(holes.firstRib) || !finite(holes.lastRib)) return model;
  const last = Math.min(holes.lastRib, design.geometry.ribs.length);
  for (let index = Math.max(holes.firstRib - 1, 0); index < last; index++) {
    const rib = holedRib(design, airfoils, index, holes.holes);
    if (!rib) continue;
    const { contour, cutouts } = rib;
    const focused = cutouts[active] ?? [];
    for (const side of [mirror, (p: Point3) => p]) {
      model.fills.push({
        points: contour.map(side),
        holes: cutouts.filter((cutout) => cutout.length > 2).map((cutout) => cutout.map(side)),
        kind: 'selected',
      });
      if (focused.length > 2)
        model.lines.push({
          points: [...focused, focused[0]].map(side),
          kind: 'hole',
          selected: true,
        });
    }
  }
  return model;
}

/** The generic airfoil as (x, -y), like `ribProfile`. */
const GENERIC_PROFILE: readonly Point[] = GENERIC_AIRFOIL.points.map(([x, y]) => [x, -y]);
const GENERIC_PARTS = noseParts(GENERIC_PROFILE);

/**
 * The wing that pre-data.txt generates, in 3D: its ribs with a generic
 * airfoil, without washin, independent of the sections of leparagliding.txt.
 */
export function preDataModel(result: GeometryResult): PreviewModel {
  const half = result.ribs.flatMap(
    (rib, index) =>
      placedRib(
        index,
        GENERIC_PROFILE,
        (point) => placeOnRib(rib, 0, 0, 0, point),
        GENERIC_PARTS,
      ) ?? [],
  );
  return assemble(
    half,
    -1,
    'Generated wing 3D model',
    `Generated planform and vault on a generic airfoil (${GENERIC_AIRFOIL.name}), without washin: ` +
      'section 1 sets the washin, sections 2 and 30 the airfoils.',
  );
}
