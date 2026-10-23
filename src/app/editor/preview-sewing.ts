import { finite, type Point } from './preview-geometry';
import { offsetProfile, ribProfile } from './preview-model';
import { ellipsePoints, PreviewDrawing, valueLabel, type PreviewContext } from './preview-scene';

export function sewingScene(context: PreviewContext) {
  const { design, view, rib } = context;
  const allowances = design.sewingAllowances;
  const d = new PreviewDrawing(
    'Sewing allowances',
    'Dimensions in mm · Illustrative seam offsets before engine panel corrections.',
  );
  if (view === 'rib' || view === 'v-rib') {
    const profile = ribProfile(design, context.airfoils, rib);
    const seam = view === 'rib' ? allowances.ribs : allowances.vRibs;
    d.path(profile.points, 'profile');
    if (finite(seam) && profile.chord)
      d.path(
        offsetProfile(profile.points, seam / 10 / profile.chord),
        'allowance',
        true,
        `${seam} mm`,
        true,
      );
    d.frame([
      [0, -0.15],
      [1, 0.2],
    ]);
    d.label([0.5, 0.18], `${view === 'rib' ? 'Rib' : 'V-rib'} edges: ${valueLabel(seam, ' mm')}`);
    if (!profile.points.length) d.label([0.5, 0], 'Airfoil coordinates unavailable');
  } else {
    for (const [i, key] of (['upper', 'lower'] as const).entries()) {
      const a = allowances[key],
        x = i * 170;
      d.path(
        [
          [x, 0],
          [x + 120, 0],
          [x + 120, 65],
          [x, 65],
        ],
        'profile',
        false,
        '',
        true,
      );
      if ([a.sides, a.leadingEdge, a.trailingEdge].every(finite)) {
        d.path(
          [
            [x - a.sides!, -a.leadingEdge!],
            [x + 120 + a.sides!, -a.leadingEdge!],
            [x + 120 + a.sides!, 65 + a.trailingEdge!],
            [x - a.sides!, 65 + a.trailingEdge!],
          ],
          'allowance',
          true,
          '',
          true,
        );
      }
      d.label(
        [x + 60, -22],
        `${key === 'upper' ? 'Extrados' : 'Intrados'} · LE ${valueLabel(a.leadingEdge, ' mm')}`,
      );
      d.label([x + 60, 35], `Sides ${valueLabel(a.sides, ' mm')}`);
      d.label([x + 60, 95], `TE ${valueLabel(a.trailingEdge, ' mm')}`);
    }
  }
  return d.finish();
}

export function sewingMarksScene({ design }: PreviewContext) {
  const { spacing, pointRadius, pointOffset } = design.marks;
  const d = new PreviewDrawing(
    'Sewing marks',
    '100 cm seam sample · Spacing, radius and offset in cm.',
  );
  d.path(
    [
      [0, 0],
      [100, 0],
    ],
    'baseline',
  );
  d.label(
    [50, -12],
    `Spacing ${valueLabel(spacing, ' cm')} · radius ${valueLabel(pointRadius, ' cm')} · offset ${valueLabel(pointOffset, ' cm')}`,
  );
  if (finite(spacing) && spacing > 0 && finite(pointRadius) && finite(pointOffset)) {
    const count = Math.floor(100 / spacing) + 1;
    for (let i = 0; i < Math.min(count, 300); i++) {
      d.dot(
        [i * spacing, -pointOffset],
        Math.max(0.04, pointRadius),
        `Mark ${i + 1}`,
        false,
        'mark',
      );
    }
    if (count > 300) d.label([50, 12], 'First 300 marks shown');
  } else d.label([50, 12], 'Enter a positive spacing and complete mark dimensions');
  d.frame([
    [0, -16],
    [100, 16],
  ]);
  return d.finish();
}

const MARK_NAMES = [
  'General point',
  'Point 2',
  'Point 3',
  'Vent',
  'Tab',
  'Jonc',
  'Reference',
  'Panel numerals',
  'Rib numerals',
  'HVR numerals',
];
export function markTypeScene({ design, selected, view }: PreviewContext) {
  const row = design.markTypes[selected];
  const mark = view === 'laser' ? row?.laser : row?.print;
  const kind = mark?.type,
    size = mark?.size,
    offset = mark?.offset;
  const d = new PreviewDrawing(
    `${MARK_NAMES[selected] ?? 'Mark'} · ${view === 'laser' ? 'Laser' : 'Print'}`,
    'Sample marking · mm · Dashed: reference edge.',
  );
  if (!finite(kind) || !finite(size) || !finite(offset)) {
    d.label([0, 0], 'Complete the mark parameters');
    return d.finish();
  }
  const extent = selected === 7 ? 20 : Math.max(1, Math.abs(offset) + Math.abs(size) * 2);
  d.path(
    [
      [-extent, 0],
      [extent, 0],
    ],
    'baseline',
  );
  d.frame([
    [-extent, -extent],
    [extent, extent * 0.3],
  ]);
  const y = -offset;
  const point = (p: Point) => d.dot(p, Math.max(0.015, extent * 0.012), '', true, 'mark');
  const romanV = (x: number, y: number, step: number) => {
    point([x, y]);
    point([x + step / 2, y - step]);
    point([x + step, y]);
  };
  let note = `Form ${kind} · size ${valueLabel(size, ' mm')} · offset ${valueLabel(offset, ' mm')}.`;
  if (selected <= 2 || selected === 5 || selected === 6) {
    if (kind === 2)
      d.path(ellipsePoints([0, y], Math.abs(size), Math.abs(size)), 'detail', true, '', true);
    else if (kind === 1 && view === 'laser') point([0, y]);
    else if (kind === 1) {
      d.path(
        [
          [-Math.abs(size), y],
          [Math.abs(size), y],
        ],
        'detail',
        true,
      );
      d.path(
        [
          [0, y - Math.abs(size)],
          [0, y + Math.abs(size)],
        ],
        'detail',
        true,
      );
      d.path(
        Array.from({ length: 9 }, (_, i): Point => [
          size * Math.cos((i * Math.PI) / 4),
          y + size * Math.sin((i * Math.PI) / 4),
        ]),
        'detail',
        true,
        '',
        true,
      );
    }
  } else if (selected === 3) {
    if (kind === 1) {
      point([0, y]);
      point([0, y - size]);
    }
    if (kind === 2)
      d.path(
        [
          [0, y],
          [0, y - size],
        ],
        'detail',
        true,
      );
    if (kind === 3) {
      d.path(
        [
          [0, y],
          [0, y - size / 3],
        ],
        'detail',
        true,
      );
      d.path(
        [
          [0, y - (size * 2) / 3],
          [0, y - size],
        ],
        'detail',
        true,
      );
    }
  } else if (selected === 4) {
    if (kind === 3)
      d.path(
        [
          [0, y],
          [-size / Math.sqrt(3), y - size],
          [size / Math.sqrt(3), y - size],
        ],
        'detail',
        true,
        '',
        true,
      );
    else if (kind === 1 || kind === 2) [0, 1, 2].forEach((i) => point([0, y - i * size]));
  } else if (selected === 7) {
    const x = view === 'laser' ? -20 + (row?.print.size ?? 0.2) * 40 : -20 + size * 40;
    const step = Math.abs(row?.laser.offset ?? 0);
    if (step) romanV(x, y, step);
    note = `Roman V sample · position ${valueLabel(row?.print.size)} along a 40 mm reference · vertical offset ${valueLabel(row?.print.offset, ' mm')} · dot spacing ${valueLabel(row?.laser.offset, ' mm')}.`;
  } else if (selected === 8 || selected === 9) {
    if (view === 'print') {
      if (offset > 0) d.label([0, 0], '12', 'middle', offset * 10);
      note = `Decimal number sample · height ${valueLabel(offset, ' cm')}.`;
    } else {
      if (selected === 8 && size > 0) romanV(-extent / 2, 0, size);
      if (offset > 0) romanV(extent / 2, 0, offset);
      note =
        selected === 8
          ? `Roman V samples · rod pockets ${valueLabel(size, ' mm')} · ribs ${valueLabel(offset, ' mm')}.`
          : `Roman V sample · HVR dot spacing ${valueLabel(offset, ' mm')}.`;
    }
  }
  if ([1, 2, 5, 6].includes(selected) || selected > 9)
    note += ' This row is unused by engine 3.29.';
  const scene = d.finish();
  scene.note += ' ' + note;
  return scene;
}
