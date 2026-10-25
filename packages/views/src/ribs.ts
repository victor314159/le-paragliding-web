import type { LepAirfoil } from '@lepara/format';
import { finite, holeOutline, type Point } from './geometry.ts';
import { airfoilPart, offsetProfile, ribProfile, type ProfileSections } from './profile.ts';
import { PreviewDrawing, valueLabel, type PreviewContext } from './scene.ts';

const CHORD: Point[] = [
  [0, 0],
  [1, 0],
];
const UNAVAILABLE = 'Airfoil coordinates unavailable';

/** Sections 2 and 3: the input profile of the selected rib, with its air inlet or anchors. */
export function ribScene(
  { design, airfoils, selected }: PreviewContext<ProfileSections>,
  anchors: boolean,
) {
  const profile = ribProfile(design, airfoils, selected);
  const row = design.airfoils[selected];
  const d = new PreviewDrawing(
    `Rib ${selected + 1} · ${anchors ? 'anchors' : 'air inlet'}`,
    `${profile.name || 'No airfoil assigned'} · thickness ×${profile.thickness} · ${profile.open === 1 ? 'Open' : 'Closed'} · ` +
      (anchors
        ? 'A–E: anchors · F: brake · Interpolated on the input intrados where available.'
        : 'Red contour: air inlet · Dashed lines: inlet limits (% chord).'),
  );
  if (!profile.points.length) d.label([0.5, 0], UNAVAILABLE);
  d.path(CHORD, 'chord');
  d.path(profile.points, 'profile');
  if (anchors)
    for (const a of profile.anchors) {
      d.dot(
        [a.x, a.y],
        0.008,
        `${a.name} · ${valueLabel(a.x * 100)}% chord · ${a.onSurface ? 'intrados' : 'on chord (no contour at this position)'}`,
        false,
        'anchor-dot',
        a.color,
      );
      d.label([a.x, a.y + 0.05], a.name, 'middle', 0.026);
    }
  else {
    const heights = profile.points.map(([, y]) => y);
    const top = Math.min(-0.08, ...heights),
      bottom = Math.max(0.08, ...heights);
    d.path(profile.intake, 'intake');
    for (const x of [row?.intakeStart, row?.intakeEnd])
      if (finite(x))
        d.path(
          [
            [x / 100, top],
            [x / 100, bottom],
          ],
          'inlet',
        );
  }
  d.frame([
    [0, -0.08],
    [1, 0.08],
  ]);
  return d.finish();
}

/**
 * Section 4: the holes of the selected group on its rib `rib`, if in its
 * range, with the anchors and the rib seam offset (section 6).
 */
export function holesScene({
  design,
  airfoils,
  selected,
  active,
  rib,
}: PreviewContext<ProfileSections | 'holes' | 'sewingAllowances'>) {
  const group = design.holes[selected];
  if (!group) {
    const d = new PreviewDrawing('Rib holes', '');
    d.label([0.5, 0], 'Add a hole group to preview its layout');
    return d.finish();
  }
  const inGroup =
    finite(group.firstRib) &&
    finite(group.lastRib) &&
    rib + 1 >= group.firstRib &&
    rib + 1 <= group.lastRib;
  const profile = ribProfile(design, airfoils, inGroup ? rib : -1);
  const points = profile.points;
  const seam = design.sewingAllowances.ribs;
  const allowance =
    profile.chord && finite(seam) ? offsetProfile(points, seam / 10 / profile.chord) : [];
  const holes = group.holes.map((hole) => holeOutline(hole));
  const omitted = holes.flatMap((hole, i) => (hole ? [] : [i + 1]));
  const d = new PreviewDrawing(
    `Rib holes · group ${selected + 1}${inGroup ? ` · rib ${rib + 1}` : ''}`,
    [
      !inGroup
        ? "No project rib in this group's range. Only the hole coordinates are shown."
        : points.length
          ? profile.name
          : 'Airfoil coordinates are unavailable for this rib.',
      omitted.length &&
        `Not drawn: holes ${omitted.join(', ')} (unsupported type or incomplete/invalid dimensions).`,
      `Input profile · % chord · Dashed: ${valueLabel(seam)} mm seam offset, before panel corrections.`,
    ]
      .filter(Boolean)
      .join(' · '),
  );
  d.path(allowance, 'allowance', false, '', true);
  d.path(points, 'profile');
  d.path(CHORD, 'chord');
  holes.forEach((hole, i) => {
    if (hole) d.shape(hole.path, hole.points, 'hole', i === active, `Hole ${i + 1}`);
  });
  for (const a of profile.anchors) {
    d.dot(
      [a.x, a.y],
      0.007,
      `${a.name} · ${valueLabel(a.x * 100)}% chord`,
      false,
      'anchor-dot',
      a.color,
    );
    d.label([a.x, a.y + 0.05], a.name, 'middle', 0.025);
  }
  const y = Math.max(0.08, ...points.map((p) => p[1]), ...allowance.map((p) => p[1])) + 0.1;
  if (profile.chord) {
    d.shape(
      `M0,${y} H1 M0,${y - 0.015} v0.03 M1,${y - 0.015} v0.03`,
      [
        [0, y],
        [1, y],
      ],
      'dimension',
    );
    d.label([0.5, y + 0.04], `${profile.chord.toFixed(1)} cm · chord`, 'middle', 0.025);
  }
  d.frame([
    [0, -0.08],
    [1, y + 0.06],
  ]);
  return d.finish();
}

/** Section 30: the input profile of rib `rib`, before and after its thickness coefficient. */
export function thicknessScene({ design, airfoils, rib }: PreviewContext<ProfileSections>) {
  const profile = ribProfile(design, airfoils, rib);
  const original = ribProfile({ ...design, thickness: { mode: 0 } }, airfoils, rib);
  const coefficient = design.thickness.mode === 0 ? 1 : design.thickness.ribs[rib];
  const d = new PreviewDrawing(
    `Thickness · rib ${rib + 1} · original and modified`,
    [
      `${profile.name} · coefficient ${finite(coefficient) ? coefficient : 'unavailable'} · Dashed: original · Solid: modified · Input profile, % chord.`,
      design.thickness.mode === 0 && 'Thickness modification is disabled.',
      !finite(coefficient) && 'Enter a coefficient to see the modified profile.',
    ]
      .filter(Boolean)
      .join(' '),
  );
  if (!original.points.length) d.label([0.5, 0], UNAVAILABLE);
  d.path(CHORD, 'chord');
  if (finite(coefficient)) d.path(profile.points, 'modified');
  d.path(original.points, 'original');
  d.frame([
    [0, -0.08],
    [1, 0.08],
  ]);
  return d.finish();
}

/** An airfoil file as typed, y up, with the point `selected` ringed. */
export function airfoilScene(name: string, airfoil: LepAirfoil | undefined, selected: number) {
  const points = (airfoil?.points ?? []).flatMap(([x, y], index) =>
    finite(x) && finite(y)
      ? [
          {
            index,
            point: [x, -y] as Point,
            label: `${valueLabel(x)}, ${valueLabel(y)}`,
            inlet: airfoil?.format === 'txt' && airfoilPart(airfoil, index) === 'inlet',
          },
        ]
      : [],
  );
  const heights = points.map(({ point }) => point[1]);
  const chosen = points.find((p) => p.index === selected);
  const d = new PreviewDrawing(
    `Airfoil ${name} · ${points.length} points · thickness ${
      points.length
        ? `${valueLabel((Math.max(...heights) - Math.min(...heights)) * 100)} % chord`
        : '—'
    }${chosen ? ` · Point ${chosen.index + 1}: (${chosen.label})` : ''}`,
    airfoil?.format === 'txt'
      ? 'Red: air inlet points · Ringed: the selected row · Dashed: the chord.'
      : 'Ringed: the selected row · Dashed: the chord · The engine places the air inlet from section 2.',
  );
  if (!points.length)
    d.label([0.5, 0], 'Add points with finite coordinates to preview this airfoil');
  d.path(
    points.map(({ point }) => point),
    'profile',
    false,
    '',
    true,
  );
  d.path(CHORD, 'chord');
  const inlet = points.filter((p) => p.inlet).map(({ point }) => point);
  if (inlet.length > 1) d.path(inlet, 'intake');
  for (const p of points)
    d.dot(
      p.point,
      0.0035,
      `Point ${p.index + 1} · ${p.label}`,
      false,
      p.inlet ? 'inlet-point' : 'point',
    );
  if (chosen) d.dot(chosen.point, 0.009, '', true, 'ring');
  return d.finish();
}
