import type { LepAirfoil, LepDesign, SkinTensionGroup, SkinTensionPoint } from '@lepara/format';
import type { GeometryResult } from '@lepara/preprocessor';
import { GENERIC_AIRFOIL } from './generic-airfoil.ts';
import { finite, holeOutline, mirrored, type Point } from './geometry.ts';
import { placeOnRib, ribPoint, type Point3 } from '@lepara/geometry';
import { ANCHOR_COLORS, ANCHOR_NAMES, ribProfile, type ProfileSections } from './profile.ts';
import { tensionCurve, type TensionSurface } from './patterns.ts';
import type { PreviewScene } from './scene.ts';

/**
 * A 3D drawing in the engine's absolute coordinates (Z down). `surfaces`
 * are grids whose consecutive rows are joined, those with a `color` drawn
 * over the skin in it, `fills` planar outlines,
 * concave or not, with `holes`, and `dots` points; `kind` and `color` style them as in
 * `PreviewScene`.
 */
export interface PreviewModel {
  title: string;
  note: string;
  surfaces: { rows: Point3[][]; kind: string; color?: string }[];
  fills: { points: Point3[]; holes?: Point3[][]; kind: string }[];
  dots: { point: Point3; kind: string; selected: boolean; color?: string }[];
  lines: { points: Point3[]; kind: string; selected: boolean; color?: string }[];
  legend: PreviewScene['legend'];
  /** The direction the view looks from, when not the default one. */
  camera?: Point3;
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
 * A point of a section: its surface and position there, as section 5 gives
 * them (% of the surface length, from the leading edge on the extrados,
 * from the trailing edge on the intrados).
 */
interface Station {
  readonly surface: TensionSurface | 'inlet';
  readonly position: number;
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
  readonly stations: readonly Station[];
  readonly open: boolean;
  readonly anchors: readonly { name: string; point?: Point3 }[];
}

/** The positions (%) of `points` along them, 100 at the first and 0 at the last. */
function positions(points: readonly Point[]): number[] {
  const lengths = [0];
  for (let i = 1; i < points.length; i++)
    lengths.push(
      lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]),
    );
  const total = lengths[lengths.length - 1] || 1;
  return lengths.map((length) => 100 * (1 - length / total));
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
  // The extrados from the trailing edge to the inlet, the intrados from the inlet.
  const fromLeadingEdge = positions(flat.slice(0, INLET[0] + 1));
  const fromTrailingEdge = positions(flat.slice(INLET[1]));
  const stations = flat.map((_, k): Station =>
    k <= INLET[0]
      ? { surface: 'extrados', position: fromLeadingEdge[k] }
      : k >= INLET[1] && sampled.length > 3
        ? { surface: 'intrados', position: fromTrailingEdge[k - INLET[1]] }
        : { surface: 'inlet', position: 0 },
  );
  return {
    index,
    contour,
    section: sampled.length > 2 && section.length === count ? section : undefined,
    stations,
    open,
    anchors,
  };
}

/** Rows of skin between two ribs, when it balloons. */
const SUBDIVISIONS = 8;

type Vector = readonly [number, number, number];
const sub = (a: Vector, b: Vector): Vector => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const distance = (a: Vector, b: Vector) => Math.hypot(...sub(a, b));

/** The overwidth (% of the cell width) of a panel's edge on rib `index` at `station`. */
type Overwidth = (station: Station, index: number) => number;

/** A ribbed run of skin: each rib's section and stations. */
type Run = { index: number; section: Point3[]; stations: readonly Station[] }[];

/**
 * The rows of skin of `run`, ballooned between its ribs: each panel an arc
 * of circle as long as the cell is wide plus its overwidth on both edges,
 * as the engine adds it (§8.2): `overwidth` (% of the cell width at the
 * middle of the surface) on the edge of each rib.
 */
function inflate(run: Run, overwidth: Overwidth): Point3[][] {
  const rows = [run[0].section];
  const last = run[0].section.length - 1;
  const middle = {
    extrados: Math.round(INLET[0] / 2),
    intrados: Math.round((INLET[1] + last) / 2),
  };
  for (let i = 1; i < run.length; i++) {
    const [a, b] = [run[i - 1].section, run[i].section];
    const points = [...a, ...b];
    const center: Vector = [0, 1, 2].map(
      (axis) => points.reduce((sum, p) => sum + p[axis], 0) / points.length,
    ) as unknown as Vector;
    const arcs = a.map((p, k) => {
      const station = run[i - 1].stations[k];
      if (station.surface === 'inlet') return undefined;
      const width = distance(a[middle[station.surface]], b[middle[station.surface]]);
      const extra =
        ((Math.max(0, overwidth(station, run[i - 1].index)) +
          Math.max(0, overwidth(station, run[i].index))) *
          width) /
        100;
      const chord = distance(p, b[k]);
      if (!extra || !chord) return undefined;
      // Outwards, across the panel: its span crossed with the section's tangent.
      const span = sub(b[k], p);
      const tangent = sub(a[Math.min(k + 1, last)], a[Math.max(k - 1, 0)]);
      let normal: Vector = [
        span[1] * tangent[2] - span[2] * tangent[1],
        span[2] * tangent[0] - span[0] * tangent[2],
        span[0] * tangent[1] - span[1] * tangent[0],
      ];
      const length = Math.hypot(...normal);
      if (!length) return undefined;
      const mid: Vector = [(p[0] + b[k][0]) / 2, (p[1] + b[k][1]) / 2, (p[2] + b[k][2]) / 2];
      const sign = dot(normal, sub(mid, center)) < 0 ? -1 : 1;
      normal = normal.map((value) => (sign * value) / length) as unknown as Vector;
      // The sagitta of an arc `extra` longer than its chord, for a shallow arc.
      const sagitta = Math.sqrt((3 * chord * extra) / 8);
      const radius = (chord * chord) / 4 + sagitta * sagitta;
      return { normal, chord, sagitta, radius: radius / (2 * sagitta) };
    });
    for (let j = 1; j < SUBDIVISIONS; j++) {
      const t = j / SUBDIVISIONS;
      rows.push(
        a.map((p, k): Point3 => {
          const q = p.map((value, axis) => value + (b[k][axis] - value) * t);
          const arc = arcs[k];
          if (!arc) return q as unknown as Point3;
          const x = (t - 0.5) * arc.chord;
          const lift = Math.sqrt(arc.radius ** 2 - x * x) - (arc.radius - arc.sagitta);
          return q.map((value, axis) => value + arc.normal[axis] * lift) as unknown as Point3;
        }),
      );
    }
    rows.push(b);
  }
  return rows;
}

/**
 * Both halves of a wing from its `half`: the ribs, the skin between
 * adjacent ribs, straight or ballooned by `overwidth`, open at the air
 * inlets of open cells, and the anchor rows; the rib `row` highlighted,
 * and the outlines of the `highlighted` ones.
 */
function assemble(
  half: readonly PlacedRib[],
  row: number,
  title: string,
  note: string,
  overwidth?: Overwidth,
  highlighted?: (index: number) => boolean,
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
  for (const { index, section, stations } of mirrored(half, (r) => ({
    ...r,
    section: r.section?.map(mirror),
  }))) {
    if (!section) previous = undefined;
    else {
      if (previous === undefined || Math.abs(index - previous) > 1) runs.push([]);
      runs[runs.length - 1].push({ index, section, stations });
      previous = index;
    }
  }
  const open = new Set(half.filter((r) => r.open).map((r) => r.index));
  const surfaces: PreviewModel['surfaces'] = [];
  for (const run of runs.filter((ribs) => ribs.length > 1)) {
    const rows = overwidth ? inflate(run, overwidth) : run.map(({ section }) => section);
    const step = overwidth ? SUBDIVISIONS : 1;
    const columns = (from: number, to?: number, cell?: number) =>
      (cell === undefined ? rows : rows.slice((cell - 1) * step, cell * step + 1)).map((points) =>
        points.slice(from, to === undefined ? undefined : to + 1),
      );
    surfaces.push({ rows: columns(0, INLET[0]), kind: 'skin' });
    if (run[0].section.length - 1 > INLET[1])
      surfaces.push({ rows: columns(INLET[1]), kind: 'skin' });
    // A cell is that of its outer rib, the central one that of the first rib.
    for (let i = 1; i < run.length; i++)
      if (!open.has(Math.max(run[i - 1].index, run[i].index)))
        surfaces.push({ rows: columns(INLET[0], INLET[1], i), kind: 'skin' });
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

/** The overwidth (% of the cell width) of `points` at `station`, linear between them. */
function overwidthAt(points: readonly SkinTensionPoint[], { surface, position }: Station) {
  if (surface === 'inlet') return 0;
  const curve = tensionCurve(points, surface).sort((a, b) => a.position - b.position);
  if (!curve.length) return 0;
  const next = curve.findIndex((p) => p.position >= position);
  if (next <= 0) return curve[next === 0 ? 0 : curve.length - 1].value;
  const [a, b] = [curve[next - 1], curve[next]];
  return a.value + ((b.value - a.value) * (position - a.position)) / (b.position - a.position || 1);
}

/**
 * The wing of a design in 3D, both halves: each rib's airfoil placed as the
 * engine places it, the skin straight between ribs or ballooned by
 * `overwidths` (section 5), or by those of each rib (index from 0) on its
 * panel edges (section 31), open at the inlets of open cells, or of every
 * cell without `inlets`, and, with `anchors`, the anchor rows; the rib
 * `row` highlighted, and the outlines of the `ribs`.
 */
export function wingModel(
  design: Pick<LepDesign, ProfileSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  {
    row = -1,
    anchors = false,
    overwidths,
    inlets = true,
    ribs,
  }: {
    row?: number;
    anchors?: boolean;
    overwidths?:
      readonly SkinTensionPoint[] | ((index: number) => readonly SkinTensionPoint[] | undefined);
    inlets?: boolean;
    ribs?: (index: number) => boolean;
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
  return assemble(
    half,
    row,
    overwidths ? 'Wing 3D model · ballooned skin' : 'Wing 3D model',
    'At Wing scale · Ribs placed as the engine places them, ' +
      (overwidths
        ? 'skin ballooned by these overwidths: each panel an arc of circle as long as the ' +
          'cell plus its overwidth on both edges, an illustration of the cut, not the flying ' +
          'shape. No 3D shaping.'
        : 'skin straight between ribs: no ballooning or 3D shaping.') +
      (single
        ? ' Single skin: the skin over the extrados and air inlets only, as the engine meshes it.'
        : ''),
    overwidths &&
      ((station, index) => {
        const points = typeof overwidths === 'function' ? overwidths(index) : overwidths;
        return points ? overwidthAt(points, station) : 0;
      }),
    ribs,
  );
}

/** The overwidths of each rib (from 0) under section 31: its group's, the last that names it. */
function groupOverwidths(groups: readonly SkinTensionGroup[]) {
  const last = [...groups].reverse();
  return (index: number) =>
    last.find((g) => g.firstRib <= index + 1 && index + 1 <= g.lastRib)?.points;
}

/**
 * Section 5: the wing in 3D, its skin ballooned as the engine does: by
 * these overwidths, or, when section 31 is active, by its groups, which
 * replace them.
 */
export function tensionModel(
  design: Pick<LepDesign, ProfileSections | 'skinTension' | 'skinTensionGroups'>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
): PreviewModel {
  const groups = design.skinTensionGroups;
  if (groups.mode === 0)
    return wingModel(design, airfoils, { overwidths: design.skinTension.points });
  const model = wingModel(design, airfoils, { overwidths: groupOverwidths(groups.groups) });
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
  design: Pick<LepDesign, ProfileSections | 'skinTension' | 'skinTensionGroups'>,
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
  const model = wingModel(design, airfoils, {
    overwidths: groupOverwidths(tension.groups),
    // The last rib may be the virtual one past the tip, nribss + 1.
    ribs: (index) =>
      !!group &&
      (index + 1 === group.firstRib ||
        index + 1 === Math.min(group.lastRib, design.geometry.ribs.length)),
  });
  model.title = `Wing 3D model · skin tension group ${group?.group ?? '—'}`;
  model.note =
    "Each panel edge ballooned by its rib's group; the selected group's first and last ribs " +
    'highlighted; ribs in no group without overwidth. ' +
    model.note;
  return model;
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
  const outlines = holes.holes.map((hole) => holeOutline(hole)?.points ?? []);
  const last = Math.min(holes.lastRib, design.geometry.ribs.length);
  for (let index = Math.max(holes.firstRib - 1, 0); index < last; index++) {
    const place = (point: Point) => ribPoint(design, index, point);
    const contour = placeEach(ribProfile(design, airfoils, index).points, place);
    if (contour.length < 3) continue;
    const cutouts = outlines.map((outline) => placeEach(outline, place));
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
