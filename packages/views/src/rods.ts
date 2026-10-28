import type {
  ArcRodGroup,
  LepAirfoil,
  LepDesign,
  Joncs,
  LongRodGroup,
  NoseRodGroup,
  RodCurve,
  ShapingGroup,
  SharkNoseGroup,
} from '@lepara/format';
import { ribPoint, type Point3 } from '@lepara/geometry';
import { finite, type Point } from './geometry.ts';
import { wingModel, type PreviewModel } from './model.ts';
import { SURFACE_COLORS } from './patterns.ts';
import { contourPoint, ribProfile, type ProfileSections } from './profile.ts';
import { arcPoints, PreviewDrawing, valueLabel, type PreviewContext } from './scene.ts';

type Profile = ReturnType<typeof ribProfile>;

/** A rod group with the type of its bloc: nose rods (mode 1) are type 1. */
export type Rod =
  | { readonly type: 1; readonly group: NoseRodGroup }
  | { readonly type: 2; readonly group: ArcRodGroup }
  | { readonly type: 3; readonly group: SharkNoseGroup }
  | { readonly type: 4 | 5; readonly group: LongRodGroup };

/** Group `index` of the nose rods, or of bloc `bloc`. */
export function rodOf(joncs: Joncs, bloc: number, index: number): Rod | undefined {
  if (joncs.mode === 0) return undefined;
  if (joncs.mode === 1) {
    const group = joncs.groups[index];
    return group && { type: 1, group };
  }
  const b = joncs.blocs[bloc];
  const group = b?.groups[index];
  // A bloc's groups have its type.
  return group && ({ type: b.type, group } as Rod);
}

/** A contour segment at chord limits, in the requested direction. */
export function profileSegment(surface: readonly Point[], from: number, to: number): Point[] {
  const a = contourPoint(surface, from),
    b = contourPoint(surface, to);
  if (!a || !b) return [];
  const between = surface
    .filter(([x]) => x > Math.min(from, to) && x < Math.max(from, to))
    .sort((a, b) => (from <= to ? a[0] - b[0] : b[0] - a[0]));
  return [a, ...between, b];
}

/** Power-law deflection relative to the input profile, as used by joncs(). */
export function deflectedRod(
  surface: readonly Point[],
  curve: RodCurve,
  direction: number,
): Point[] {
  const { from, to, deflection, exponent } = curve;
  if (![from, to, deflection, exponent].every(finite) || from === to || exponent < 0) return [];
  const points = profileSegment(surface, from / 100, to / 100);
  return points.map(([x, y]): Point => [
    x,
    y + ((direction * deflection) / 100) * ((x * 100 - from) / (to - from)) ** exponent,
  ]);
}

/** Center lines before panel corrections. Type 3 transitions follow the local contour tangent. */
export function rodOutlines(rod: Rod, profile: Profile): Point[][] {
  if (rod.type === 2) {
    const group = rod.group;
    if (![group.x1, group.y1, group.x2, group.y2, group.deflection].every(finite)) return [];
    return [
      arcPoints(
        [group.x1 / 100, -group.y1 / 100],
        [group.x2 / 100, -group.y2 / 100],
        -group.deflection / 100,
      ),
    ];
  }
  if (rod.type === 1) {
    const group = rod.group;
    const upper = deflectedRod(profile.upper, group.extrados, 1).reverse();
    const lower = deflectedRod(profile.lower, group.intrados, -1);
    const nose = [
      ...profile.upper.filter(([x]) => x < group.extrados.from / 100),
      ...profile.points.slice(
        profile.upper.length - 1,
        profile.points.length - profile.lower.length + 1,
      ),
      ...profile.lower.filter(([x]) => x < group.intrados.from / 100),
    ];
    return upper.length && lower.length ? [[...upper, ...nose, ...lower]] : [];
  }
  if (rod.type === 4 || rod.type === 5) {
    const { group, type } = rod;
    const surface = type === 4 ? profile.upper : profile.lower;
    const initial = deflectedRod(
      surface,
      { ...group.initial, from: group.initial.to, to: group.initial.from },
      type === 4 ? 1 : -1,
    ).reverse();
    const final = deflectedRod(surface, group.final, type === 4 ? 1 : -1);
    if (!initial.length || !final.length) return [];
    const middle = profileSegment(surface, group.initial.to / 100, group.final.from / 100);
    return [[...initial, ...middle, ...final]];
  }
  if (rod.type === 3) {
    const group = rod.group;
    const transition = (curve: RodCurve, lower: boolean): Point[] => {
      if (
        ![curve.from, curve.to, curve.deflection, curve.exponent].every(finite) ||
        !profile.chord ||
        curve.to === 0 ||
        curve.exponent <= 0
      )
        return [];
      const start = contourPoint(profile.lower, curve.from / 100);
      const near = contourPoint(profile.lower, curve.from / 100 + (lower ? 0.002 : -0.002));
      if (!start || !near) return [];
      let angle = Math.atan((near[1] - start[1]) / (near[0] - start[0]));
      if (lower) angle += Math.PI;
      const exponent = (curve.exponent * profile.chord) / 100;
      return Array.from({ length: 21 }, (_, i): Point => {
        const x = ((curve.to / 100) * i) / 20;
        const y = (((lower ? 1 : -1) * curve.deflection) / 100) * (i / 20) ** exponent;
        return [
          start[0] + x * Math.cos(angle) - y * Math.sin(angle),
          start[1] + x * Math.sin(angle) + y * Math.cos(angle),
        ];
      });
    };
    const upper = deflectedRod(profile.upper, group.extrados, 1).reverse();
    const topTransition = transition(group.upperRod, false);
    const nose = profile.points.filter(
      ([x, y]) =>
        (y <= 0 && x < group.extrados.from / 100) || (y > 0 && x <= group.upperRod.from / 100),
    );
    const bottomTransition = transition(group.lowerRod, true).reverse();
    const lower = deflectedRod(profile.lower, group.intrados, -1);
    const lowerMiddle = profileSegment(
      profile.lower,
      group.lowerRod.from / 100,
      group.intrados.from / 100,
    );
    return [
      upper.length && topTransition.length ? [...upper, ...nose, ...topTransition] : [],
      bottomTransition.length && lower.length
        ? [...bottomTransition, ...lowerMiddle, ...lower]
        : [],
    ];
  }
  return [];
}

export function offsetPolyline(points: readonly Point[], distance: number): Point[] {
  return points.map((p, i): Point => {
    const a = points[Math.max(0, i - 1)],
      b = points[Math.min(points.length - 1, i + 1)];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return length
      ? [p[0] - (distance * (b[1] - a[1])) / length, p[1] + (distance * (b[0] - a[0])) / length]
      : p;
  });
}

export function rodsScene(context: PreviewContext<ProfileSections | 'joncs'>) {
  const { design, selected, secondary, rib } = context;
  const profile = ribProfile(design, context.airfoils, rib);
  const rod = rodOf(design.joncs, secondary, selected);
  const d = new PreviewDrawing(
    `Nylon rods · rib ${rib + 1}`,
    'Input profile and rod center lines · Dashed: pocket boundaries, before panel corrections.',
  );
  d.path(profile.points, 'profile');
  d.frame([
    [0, -0.12],
    [1, 0.2],
  ]);
  if (design.joncs.mode === 0) d.label([0.5, 0.16], 'Nylon rods are disabled');
  else if (rod) {
    const { group, type } = rod;
    const rods = rodOutlines(rod, profile).filter((p) => p.length > 1);
    for (const points of rods) {
      d.path(points, 'rod', true, `Rod type ${type}`);
      const pocket = group.pocket;
      if (
        profile.chord &&
        [pocket.offset, pocket.outerWidth, pocket.rodWidth, pocket.innerWidth].every(finite)
      ) {
        for (const width of [
          -pocket.outerWidth - pocket.rodWidth / 2,
          pocket.innerWidth + pocket.rodWidth / 2,
        ])
          d.path(
            offsetPolyline(points, (pocket.offset + width) / (10 * profile.chord)),
            'allowance',
          );
      }
    }
    if (!rods.length)
      d.label([0.5, 0.16], 'Complete the rod parameters and choose an available airfoil');
    else
      d.label(
        [0.5, 0.18],
        `Type ${type} · group ${valueLabel(group.group)} · ribs ${valueLabel(group.firstRib)}–${valueLabel(group.lastRib)}`,
      );
  } else d.label([0.5, 0.16], 'Add a rod group to preview its curves');
  return d.finish();
}

export function additionalPointsScene(context: PreviewContext<ProfileSections | 'ribPoints'>) {
  const { design, rib, selected } = context;
  const profile = ribProfile(design, context.airfoils, rib);
  const d = new PreviewDrawing(
    `Additional rib points · rib ${rib + 1}`,
    'Input coordinates in % chord · Positive Y points above the chord.',
  );
  d.path(profile.points, 'profile');
  d.path(
    [
      [0, 0],
      [1, 0],
    ],
    'baseline',
  );
  design.ribPoints.forEach(([x, y], i) => {
    if (!finite(x) || !finite(y)) return;
    d.dot(
      [x / 100, -y / 100],
      i === selected ? 0.01 : 0.006,
      `Point ${i + 1} · (${x}%, ${y}%)`,
      i === selected,
    );
    d.label([x / 100, -y / 100 - 0.025], String(i + 1));
  });
  d.frame([
    [0, -0.12],
    [1, 0.15],
  ]);
  return d.finish();
}

const mirror = ([x, y, z]: Point3): Point3 => [-x, y, z];

/**
 * Section 17: the ribs of the wing, without its skin, with the additional
 * points on each of them, as the engine places them on the ribs it draws
 * (§9.5, in % of chord), each point joined across the ribs, both halves;
 * the point `selected` and the rib `rib` highlighted.
 */
export function additionalPointsModel(
  design: Pick<LepDesign, ProfileSections | 'ribPoints'>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  rib: number,
  selected: number,
): PreviewModel {
  const model = wingModel(design, airfoils, { row: rib });
  model.surfaces = [];
  design.ribPoints.forEach(([x, y], i) => {
    if (!finite(x) || !finite(y)) return;
    const points = design.geometry.ribs.flatMap((_, index) => {
      const point = ribPoint(design, index, [x / 100, -y / 100]);
      return point ? [point] : [];
    });
    const chosen = i === selected;
    for (const side of [mirror, (p: Point3) => p]) {
      model.lines.push({ points: points.map(side), kind: 'rib-point', selected: chosen });
      for (const point of points)
        model.dots.push({ point: side(point), kind: 'rib-point', selected: chosen });
    }
  });
  model.title = 'Wing 3D model · additional rib points';
  model.note =
    'The points on every rib, as the engine marks them on the ribs it draws (§9.5), joined ' +
    'across the ribs; the selected point highlighted. At Wing scale, ribs placed as the ' +
    'engine places them, without the skin. Drag to rotate, scroll to zoom.';
  return model;
}

/**
 * Section 21: the ribs of the wing, without its skin, with the center line
 * of each rod on the ribs of its group, as the engine draws them on the
 * ribs (§6.12.6), before panel corrections, both halves; the group
 * `selected` of bloc `bloc` and the rib `rib` highlighted.
 */
export function rodsModel(
  design: Pick<LepDesign, ProfileSections | 'joncs'>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  rib: number,
  bloc: number,
  selected: number,
): PreviewModel {
  const model = wingModel(design, airfoils, { row: rib });
  model.surfaces = [];
  const { joncs } = design;
  const blocs =
    joncs.mode === 0 ? [] : joncs.mode === 1 ? [joncs.groups] : joncs.blocs.map((b) => b.groups);
  blocs.forEach((groups, b) =>
    groups.forEach((_, g) => {
      const rod = rodOf(joncs, b, g);
      if (!rod || !finite(rod.group.firstRib) || !finite(rod.group.lastRib)) return;
      const last = Math.min(rod.group.lastRib, design.geometry.ribs.length);
      for (let index = Math.max(rod.group.firstRib - 1, 0); index < last; index++)
        for (const outline of rodOutlines(rod, ribProfile(design, airfoils, index))) {
          const points = outline.flatMap((p) => {
            const point = ribPoint(design, index, p);
            return point ? [point] : [];
          });
          if (points.length > 1)
            for (const side of [mirror, (p: Point3) => p])
              model.lines.push({
                points: points.map(side),
                kind: 'rod',
                selected: b === (joncs.mode === 1 ? 0 : bloc) && g === selected,
              });
        }
    }),
  );
  model.title = 'Wing 3D model · nylon rods';
  model.note =
    'The center line of each rod on the ribs of its group, as the engine draws them on the ' +
    'ribs (§6.12.6), before panel corrections; the selected group highlighted. At Wing scale, ' +
    'ribs placed as the engine places them, without the skin. Drag to rotate, scroll to zoom.';
  return model;
}

/** A zone of influence of section 29, between two points of the airfoil (from 1, from the TE). */
export interface ShapingZone {
  readonly zone: number;
  readonly surface: 'upper' | 'lower';
  readonly from: number;
  readonly to: number;
}

/** A cut of section 29: the cut `index` of its surface, at a point of the airfoil. */
export interface ShapingCutPoint {
  readonly surface: 'upper' | 'lower';
  readonly index: number;
  readonly point: number;
}

/**
 * The zones of influence and cut points of `group` as the engine sums them
 * (§29) on an airfoil whose extrados ends at point `extrados` and intrados
 * begins at point `intrados`: zone 1 (upper start to cut 1), 2 (upper cut 2
 * start to cut 2), 3 (last upper cut to the extrados end), 5 (intrados
 * start to the lower cut) and 6 (lower cut to its end). The engine replaces
 * the start of zone 1 with the airfoil's second-to-last point (§6), which
 * empties it: it is left out.
 */
export function shapingZones(group: ShapingGroup, extrados: number, intrados: number) {
  const zones: ShapingZone[] = [];
  const cuts: ShapingCutPoint[] = [];
  const [first, second] = group.upper.cuts;
  if (first) {
    cuts.push({ surface: 'upper', index: 0, point: first.end });
    if (second) {
      zones.push({ zone: 2, surface: 'upper', from: second.start, to: second.end });
      cuts.push({ surface: 'upper', index: 1, point: second.end });
    }
    zones.push({ zone: 3, surface: 'upper', from: (second ?? first).end, to: extrados });
  }
  const lower = group.lower.cuts[0];
  if (lower) {
    zones.push({ zone: 5, surface: 'lower', from: intrados, to: lower.start });
    zones.push({ zone: 6, surface: 'lower', from: lower.start, to: lower.end });
    cuts.push({ surface: 'lower', index: 0, point: lower.start });
  }
  const valid = (point: number) => Number.isInteger(point) && point >= 1;
  return {
    zones: zones.filter((z) => valid(z.from) && valid(z.to) && z.from < z.to),
    cuts: cuts.filter((c) => valid(c.point)),
  };
}

/** The points of a profile, from 1, where its extrados ends and its intrados begins. */
function shapingBounds({ parts }: Profile) {
  return [parts.extrados.length, parts.extrados.length + parts.inlet.length - 1] as const;
}

export function shapingScene(context: PreviewContext<ProfileSections | 'shaping'>) {
  const { design, rib, selected, active, surface, view } = context;
  const shaping = design.shaping;
  const group = shaping.mode === 0 ? undefined : shaping.groups[selected];
  const profile = ribProfile(design, context.airfoils, rib);
  const d = new PreviewDrawing(
    `Shaping cuts · rib ${rib + 1} · group ${group?.group ?? '—'}`,
    'Input profile · Colored segments: zones of influence as the engine sums them · Dots: cut ' +
      'points · The engine empties zone 1 (its start is replaced), so the first upper cut ' +
      'draws on the nose side only. The shaping changes the cut panels, not the 3D wing.',
  );
  d.path(profile.points, 'profile');
  d.frame([
    [0, -0.16],
    [1, 0.2],
  ]);
  if (shaping.mode === 0) d.label([0.5, 0.16], '3D shaping is disabled');
  else if (shaping.mode === 2)
    d.label([0.5, 0.16], 'Legacy mode: the engine ignores the entered cut-point positions');
  else if (group) {
    const { zones, cuts } = shapingZones(group, ...shapingBounds(profile));
    for (const zone of zones) {
      if (view !== 'both' && view !== zone.surface) continue;
      const points = profile.points.slice(zone.from - 1, zone.to);
      if (points.length > 1)
        d.path(
          points,
          zone.surface === 'upper' ? 'influence-upper' : 'influence-lower',
          false,
          `Zone ${zone.zone}`,
        );
    }
    for (const cut of cuts) {
      if (view !== 'both' && view !== cut.surface) continue;
      const p = profile.points[cut.point - 1];
      if (!p) continue;
      const depth = group[cut.surface].cuts[cut.index].depth;
      const chosen = cut.surface === surface && cut.index === active;
      d.dot(p, chosen ? 0.009 : 0.006, `${cut.surface} cut ${cut.index + 1}`, chosen);
      d.label(
        [p[0], p[1] + (cut.surface === 'upper' ? -0.035 : 0.045)],
        `${cut.surface === 'upper' ? 'U' : 'L'}${cut.index + 1} · k=${valueLabel(depth)}`,
      );
    }
  } else d.label([0.5, 0.16], 'Add a shaping group to locate its cuts');
  return d.finish();
}

/**
 * Section 29: the wing in 3D, its skin straight between ribs, with the cuts
 * of each panel drawn across it and their zones of influence tinted, as the
 * engine takes them: a panel those of its outer rib's group, the group the
 * number of a rib's group designates (§8.6); both halves, the cut `active`
 * of surface `surface` in group `selected` highlighted.
 */
export function shapingModel(
  design: Pick<LepDesign, ProfileSections | 'shaping'>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  selected: number,
  surface: 'upper' | 'lower',
  active: number,
): PreviewModel {
  const model = wingModel(design, airfoils);
  model.title = 'Wing 3D model · 3D shaping cuts';
  model.camera = [0.25, -1, 0.35];
  const { shaping } = design;
  const note =
    'The 3D shaping changes the cut panels (arcs on the cut edges), not the 3D wing: ' +
    'the engine leaves it out of its 3D model too.';
  if (shaping.mode !== 1) {
    model.note = `${shaping.mode === 0 ? '3D shaping is disabled.' : 'Legacy mode: the engine ignores the cut points.'} ${note} ${model.note}`;
    return model;
  }
  const ribs = design.geometry.ribs;
  // The group number of each rib, the last group that names it.
  const numbers = ribs.map(() => 0);
  for (const group of shaping.groups)
    for (let i = Math.max(group.firstRib, 1); i <= Math.min(group.lastRib, ribs.length); i++)
      numbers[i - 1] = group.group;
  const profiles = ribs.map((_, index) => ribProfile(design, airfoils, index));
  /** Point `point` (from 1) of rib `index`; -1 is rib 1 mirrored. */
  const at = (index: number, point: number): Point3 | undefined => {
    const p = profiles[Math.max(index, 0)]?.points[point - 1];
    const q = p && ribPoint(design, Math.max(index, 0), p);
    return q && (index < 0 ? [-q[0], q[1], q[2]] : q);
  };
  const sides = [mirror, (p: Point3) => p];
  ribs.forEach((_, outer) => {
    const group = shaping.groups[numbers[outer] - 1];
    if (!group) return;
    const { zones, cuts } = shapingZones(group, ...shapingBounds(profiles[outer]));
    for (const zone of zones) {
      const rows = [outer - 1, outer].map((index) => {
        const row: Point3[] = [];
        for (let point = zone.from; point <= zone.to; point++) {
          const p = at(index, point);
          if (p) row.push(p);
        }
        return row;
      });
      const width = zone.to - zone.from + 1;
      if (rows.every((row) => row.length === width))
        for (const side of sides)
          model.surfaces.push({
            rows: rows.map((row) => row.map(side)),
            kind: 'skin',
            color: SURFACE_COLORS[zone.surface === 'upper' ? 'extrados' : 'intrados'],
          });
    }
    for (const cut of cuts) {
      const [a, b] = [at(outer - 1, cut.point), at(outer, cut.point)];
      if (a && b)
        for (const side of sides)
          model.lines.push({
            points: [side(a), side(b)],
            kind: 'shaping-cut',
            selected:
              group === shaping.groups[selected] && cut.surface === surface && cut.index === active,
          });
    }
  });
  model.legend = [
    { text: 'Extrados zones', color: SURFACE_COLORS.extrados },
    { text: 'Intrados zones', color: SURFACE_COLORS.intrados },
  ];
  model.note =
    'The cuts across each panel and their zones of influence, as the engine sums them: a ' +
    "panel takes its outer rib's group; zone 1 is empty, the engine replacing its start. " +
    `${note} ${model.note}`;
  return model;
}
