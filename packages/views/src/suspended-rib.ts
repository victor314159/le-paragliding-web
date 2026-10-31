import type { LepAirfoil, LepDesign } from '@lepara/format';
import { ribPoint, type Point3, type SuspensionTriangle } from '@lepara/geometry';
import { holeOutline, type Point } from './geometry.ts';
import { holedRib } from './model.ts';
import { contourPoint, ribProfile, type ProfileSections } from './profile.ts';

/** A rib's visible outline and planar pieces of fabric, with holes already cut out. */
export interface SuspendedRib {
  readonly contour: readonly Point3[];
  readonly fills: readonly {
    readonly points: readonly Point3[];
    readonly holes?: readonly (readonly Point3[])[];
  }[];
}

/** The note of the previews that bend single-skin ribs. */
export const RIB_DEFORMATION_NOTE = 'Illustrative rib deformation towards the line attachments.';

type Edge = readonly [Point, Point];
const edges = (ring: readonly Point[]): Edge[] =>
  ring.map((point, i) => [point, ring[(i + 1) % ring.length]]);

const at = ([a, b]: Edge, x: number): Point => [
  x,
  a[1] + ((x - a[0]) * (b[1] - a[1])) / (b[0] - a[0]),
];

/**
 * A display deformation of a single-skin rib: extrados fixed, lower anchors at
 * the engine's turned endpoints, linearly blended back to the base of their
 * triangle (the extrados points three before and after, §12.7). Holes
 * follow the same mapping and, as everywhere else, should neither overlap
 * nor cross the outline. This is not a fabric solver.
 * Untouched ribs keep their original planar polygon and holes.
 */
export function suspendedRib(
  design: Pick<LepDesign, ProfileSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  index: number,
  holes: LepDesign['holes'][number]['holes'],
  triangles: readonly SuspensionTriangle[],
): SuspendedRib | undefined {
  const attachments = triangles.filter((triangle) => triangle.rib === index + 1);
  if (!attachments.length) {
    const rib = holedRib(design, airfoils, index, holes);
    return rib && { contour: rib.contour, fills: [{ points: rib.contour, holes: rib.cutouts }] };
  }
  const profile = ribProfile(design, airfoils, index);
  const place = (point: Point) => ribPoint(design, index, point);
  // Lines that reach the same chordwise point pull it once, to their mean tip.
  const groups = new Map<number, SuspensionTriangle[]>();
  for (const triangle of attachments)
    groups.set(triangle.anchor[0], [...(groups.get(triangle.anchor[0]) ?? []), triangle]);
  const controls = [...groups.values()]
    .flatMap((group) => {
      const original = place(group[0].anchor);
      if (!original) return [];
      const base = group.flatMap((triangle) => triangle.base);
      const tip = (axis: number) =>
        group.reduce((sum, { points }) => sum + points[2][axis], 0) / group.length;
      const shift = original.map((value, axis) => tip(axis) - value);
      return [{ x: group[0].anchor[0], from: Math.min(...base), to: Math.max(...base), shift }];
    })
    .sort((a, b) => a.x - b.x);
  // Each anchor pulls a tent over its triangle's base, cut at its neighbours.
  const tents = controls.map((control, i) => ({
    ...control,
    from: Math.max(control.from, controls[i - 1]?.x ?? -Infinity),
    to: Math.min(control.to, controls[i + 1]?.x ?? Infinity),
  }));
  const move = (point: Point): Point3 | undefined => {
    const original = place(point);
    const upper = contourPoint(profile.upper, point[0]);
    const lower = contourPoint(profile.lower, point[0]);
    if (!original || !upper || !lower) return original;
    const depth = lower[1] - upper[1];
    if (Math.abs(depth) < 1e-12) return original;
    const fraction = Math.max(0, Math.min(1, (point[1] - upper[1]) / depth));
    const x = point[0];
    const pull = ({ x: peak, from, to }: (typeof tents)[number]) =>
      x <= from || x >= to ? 0 : x <= peak ? (x - from) / (peak - from) : (to - x) / (to - peak);
    const offset = (axis: number) =>
      fraction * tents.reduce((sum, tent) => sum + pull(tent) * tent.shift[axis], 0);
    return [original[0] + offset(0), original[1] + offset(1), original[2] + offset(2)];
  };
  const rings = [
    profile.points,
    ...holes.map((hole) => holeOutline(hole)?.points ?? []).filter((ring) => ring.length > 2),
  ];
  // Stations where the bending changes slope: between two, the strips of
  // fabric, split in triangles, stay planar once bent.
  const stations = [
    ...new Set([
      ...rings.flat().map(([x]) => x),
      ...tents.flatMap(({ x, from, to }) => [x, from, to]),
    ]),
  ].sort((a, b) => a - b);
  // The outline bends only under the tents, with their ends.
  const bent = stations.filter((x) => tents.some(({ from, to }) => from <= x && x <= to));
  const contour = edges(profile.points).flatMap(([a, b]) => {
    const between = bent.filter((x) => x > Math.min(a[0], b[0]) && x < Math.max(a[0], b[0]));
    if (b[0] < a[0]) between.reverse();
    return [a, ...between.map((x) => at([a, b], x))]
      .map(move)
      .filter((point) => point !== undefined);
  });
  // Sweep the segments across the stations, keeping those that span the strip.
  const segments = rings
    .flatMap(edges)
    .filter(([a, b]) => a[0] !== b[0])
    .sort((a, b) => Math.min(a[0][0], a[1][0]) - Math.min(b[0][0], b[1][0]));
  let active: Edge[] = [];
  let next = 0;
  const fills: { points: Point3[] }[] = [];
  for (let i = 1; i < stations.length; i++) {
    const [left, right] = [stations[i - 1], stations[i]];
    const middle = (left + right) / 2;
    while (next < segments.length && Math.min(segments[next][0][0], segments[next][1][0]) < middle)
      active.push(segments[next++]);
    active = active.filter(([a, b]) => Math.max(a[0], b[0]) > middle);
    const crossings = active
      .map((segment) => ({ segment, y: at(segment, middle)[1] }))
      .sort((a, b) => a.y - b.y)
      .map(({ segment }) => segment);
    // Holes inside the outline and apart: the fabric lies between alternate crossings.
    for (let j = 0; j + 1 < crossings.length; j += 2) {
      const [top, bottom] = [crossings[j], crossings[j + 1]];
      const quad = [at(top, left), at(top, right), at(bottom, right), at(bottom, left)].map(move);
      for (const triangle of [
        [quad[0], quad[1], quad[2]],
        [quad[0], quad[2], quad[3]],
      ])
        if (triangle.every((point): point is Point3 => point !== undefined))
          fills.push({ points: triangle });
    }
  }
  return { contour, fills };
}
