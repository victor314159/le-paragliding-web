import type {
  ArcRodGroup,
  Joncs,
  LongRodGroup,
  NoseRodGroup,
  RodCurve,
  SharkNoseGroup,
} from '@lepara/format';
import { finite, type Point } from './geometry.ts';
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

export function shapingScene(context: PreviewContext<ProfileSections | 'shaping'>) {
  const { design, rib, selected, active, surface, view } = context;
  const shaping = design.shaping;
  const group = shaping.mode === 0 ? undefined : shaping.groups[selected];
  const profile = ribProfile(design, context.airfoils, rib);
  const d = new PreviewDrawing(
    `Shaping cuts · rib ${rib + 1} · group ${group?.group ?? '—'}`,
    'Input profile · Colored segments: influence zones · Dots: cut points · Depth coefficients label the inputs; final 3D shape requires the engine.',
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
    for (const key of ['upper', 'lower'] as const) {
      if (view !== 'both' && view !== key) continue;
      group[key].cuts.forEach((cut, i) => {
        if (
          !finite(cut.start) ||
          !finite(cut.end) ||
          !Number.isInteger(cut.start) ||
          !Number.isInteger(cut.end)
        )
          return;
        const a = cut.start - 1,
          b = cut.end - 1;
        if (!profile.points[a] || !profile.points[b]) return;
        const chosen = key === surface && i === active;
        d.path(
          profile.points.slice(Math.min(a, b), Math.max(a, b) + 1),
          key === 'upper' ? 'influence-upper' : 'influence-lower',
          chosen,
          `${key} cut ${i + 1} · depth ${valueLabel(cut.depth)}`,
        );
        const p = profile.points[key === 'upper' ? b : a];
        d.dot(p, chosen ? 0.009 : 0.006, `${key} cut ${i + 1}`, chosen);
        d.label(
          [p[0], p[1] + (key === 'upper' ? -0.035 : 0.045)],
          `${key === 'upper' ? 'U' : 'L'}${i + 1} · k=${valueLabel(cut.depth)}`,
        );
      });
    }
  } else d.label([0.5, 0.16], 'Add a shaping group to locate its cuts');
  return d.finish();
}
