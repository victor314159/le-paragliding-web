import type { LepAirfoil, LepDesign } from '@lepara/format';
import {
  miniribPatterns,
  ribPatterns,
  skinPanels,
  unloadedRibPatterns,
  vRibPatterns,
  type RibPatternSections,
  type SkinPanel,
  type SkinPanelSections,
  type UnloadedRibSections,
  type VRibPatternSections,
} from '@lepara/geometry/enhanced-v1';
import type { Point } from './geometry.ts';
import { PreviewDrawing, type PreviewScene } from './scene.ts';

/** The groups of cutting patterns: value and label. */
export const PATTERN_GROUPS = [
  ['extrados', 'Extrados panels'],
  ['intrados', 'Intrados panels'],
  ['ribs', 'Ribs'],
  ['vribs', 'H straps and V-ribs'],
  ['reinforcements', 'Rod pockets and mylars'],
] as const;
export type PatternGroup = (typeof PATTERN_GROUPS)[number][0];

/** The layout's width to its height, roughly: rows fill to this proportion. */
const ASPECT = 2;

/** A piece to lay out: its lines in its own frame, v up. */
interface Piece {
  readonly number: string;
  readonly title: string;
  readonly sewing: readonly Point[];
  readonly cuts: readonly (readonly Point[])[];
  /** Whether the engine closes its cut lines. */
  readonly closedCut: boolean;
  /** Lines drawn on it for reference, by what they show. */
  readonly references: readonly Reference[];
  readonly holes: readonly (readonly Point[])[];
  /** Sewing marks and the dots of its roman numeral. */
  readonly marks: readonly Point[];
  readonly numeral: readonly Point[];
  /** The marks of the cutting table, by what they mark. */
  readonly table: readonly TableMarks[];
}

/** Lines drawn on a piece: seams, rods, mylars. */
interface Reference {
  readonly title: string;
  readonly lines: readonly (readonly Point[])[];
}

/** Marks of the cutting table: dots, and lines (triangles, segments). */
interface TableMarks {
  readonly title: string;
  readonly dots: readonly Point[];
  readonly lines: readonly (readonly Point[])[];
}

/**
 * The pieces of a group laid flat, as the engine's sheet orients them (not
 * mirrored), in rows, numbered as the engine does; their marks at their
 * size on the fabric, or `enlarged` to be seen on the whole sheet.
 */
export function cuttingScene(
  design: Pick<
    LepDesign,
    SkinPanelSections | RibPatternSections | VRibPatternSections | UnloadedRibSections
  >,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  group: PatternGroup,
  enlarged = false,
) {
  const label = PATTERN_GROUPS.find(([value]) => value === group)![1];
  const pieces =
    group === 'ribs'
      ? ribPieces(design, airfoils)
      : group === 'vribs'
        ? vRibPieces(design, airfoils)
        : group === 'reinforcements'
          ? reinforcementPieces(design, airfoils)
          : panelPieces(design, airfoils, group);
  const d = new PreviewDrawing(label, pieces.length ? DESCRIPTIONS[group] : '');
  if (!pieces.length) {
    d.label([0, 0], emptyMessage(design, group));
    return d.finish();
  }
  // The DXF's y is up: draw (u, -v), so a piece keeps its face.
  const flip = (points: readonly Point[]) => points.map(([x, y]): Point => [x, -y]);
  const boxes = pieces.map(({ sewing, cuts }) => {
    const points = flip([...sewing, ...cuts.flat()]);
    return {
      left: Math.min(...points.map((p) => p[0])),
      right: Math.max(...points.map((p) => p[0])),
      top: Math.min(...points.map((p) => p[1])),
      bottom: Math.max(...points.map((p) => p[1])),
    };
  });
  const height = Math.max(...boxes.map((b) => b.bottom - b.top));
  const gap = height * 0.08;
  // Numbers fit under the narrowest piece.
  const font = Math.min(gap, 0.6 * Math.min(...boxes.map((b) => b.right - b.left)));
  // Marks at their size on the fabric: the laser circles of section 20,
  // row 1 (type 2), else the printed points.
  const form = design.markTypes[0];
  const size = (form?.laser.type === 2 ? form.laser.size : (form?.print.size ?? 0)) / 10;
  const radius = enlarged && size > 0 ? Math.max(size, font / 40) : size;
  // Enlarged, the cutting table's lines grow as much, from their first point.
  const scale = size > 0 ? radius / size : 1;
  const grown = ([first, ...rest]: readonly Point[]): Point[] => [
    first,
    ...rest.map(([u, v]): Point => [
      first[0] + (u - first[0]) * scale,
      first[1] + (v - first[1]) * scale,
    ]),
  ];
  const numeral = group === 'extrados' || group === 'intrados' ? 'Cell number' : 'Rib number';
  const widths = boxes.map((b) => b.right - b.left);
  // The width that lays the pieces' area out at the aspect.
  const area = boxes.reduce(
    (sum, b, i) => sum + (widths[i] + gap) * (b.bottom - b.top + 2 * font + gap),
    0,
  );
  const rowWidth = Math.max(...widths, Math.sqrt(ASPECT * area));
  // Rows as tall as their tallest piece.
  const rows: number[][] = [];
  let x = 0;
  widths.forEach((width, i) => {
    if (!rows.length || (x > 0 && x + width > rowWidth)) {
      rows.push([]);
      x = 0;
    }
    rows.at(-1)!.push(i);
    x += width + gap;
  });
  let y = 0;
  for (const row of rows) {
    x = 0;
    for (const i of row) {
      const [piece, box, width] = [pieces[i], boxes[i], widths[i]];
      const place = (points: readonly Point[]) =>
        flip(points).map(([u, v]): Point => [x + u - box.left, y + v - box.top]);
      d.path(place(piece.sewing), 'outline', false, piece.title, true);
      // Over the piece: V-ribs are cut out inside it.
      for (const cut of piece.cuts)
        d.path(place(cut), 'allowance', false, 'Cut line', piece.closedCut);
      for (const { title, lines } of piece.references)
        for (const line of lines) d.path(place(line), 'rib', false, title);
      for (const hole of piece.holes) d.path(place(hole), 'allowance', false, 'Hole', true);
      for (const mark of place(piece.marks)) d.dot(mark, radius, 'Sewing mark', false, 'mark');
      for (const dot of place(piece.numeral)) d.dot(dot, radius, numeral, false, 'numeral');
      for (const { title, dots, lines } of piece.table) {
        for (const dot of place(dots)) d.dot(dot, radius, title, false, 'table-mark');
        for (const line of lines) {
          const [first, last] = [line[0], line.at(-1)!];
          const closed = first[0] === last[0] && first[1] === last[1];
          d.path(place(grown(line)), 'table-mark', false, title, closed);
        }
      }
      d.label(
        [x + width / 2, y + box.bottom - box.top + font],
        piece.number,
        'middle',
        font,
        'rib-number',
      );
      x += width + gap;
    }
    y += Math.max(...row.map((i) => boxes[i].bottom - boxes[i].top)) + 2 * font + gap;
  }
  const scene = d.finish();
  // A pocket or a mylar is drawn by its outline alone, without a sewing line.
  const outline = group === 'reinforcements' ? 'Outline' : 'Sewing line';
  return { ...scene, legend: cuttingLegend(scene, outline), unit: 'cm' };
}

/** One entry per style the scene draws, naming what its items show. */
function cuttingLegend({ paths, dots }: PreviewScene, outline: string): PreviewScene['legend'] {
  const shown = new Map<string, Set<string>>();
  for (const { kind, title } of [...paths, ...dots])
    shown.set(kind, (shown.get(kind) ?? new Set()).add(kind === 'outline' ? outline : title));
  return [...shown].map(([kind, titles]) => ({
    text: [...titles].join(' · '),
    sample: { kind, dot: dots.some((dot) => dot.kind === kind) },
  }));
}

function panelPieces(
  design: Pick<LepDesign, SkinPanelSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  surface: SkinPanel['surface'],
): Piece[] {
  const panels = skinPanels(design, airfoils).filter((panel) => panel.surface === surface);
  return panels.map((panel) => {
    const number = panelNumber(panels, panel);
    return {
      ...panel,
      number,
      title: `Panel ${number}`,
      cuts: [panel.cut],
      closedCut: true,
      references: [{ title: 'Air inlet seam', lines: panel.joins }],
      table: [
        { title: 'Anchor', ...panel.anchors },
        { title: 'Unloaded rib seam', dots: panel.unloadedSeam, lines: [] },
      ],
    };
  });
}

function ribPieces(
  design: Pick<LepDesign, RibPatternSections | UnloadedRibSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
): Piece[] {
  const ribs = ribPatterns(design, airfoils).map((rib): Piece => ({
    ...rib,
    number: `${rib.rib + 1}`,
    title: `Rib ${rib.rib + 1}`,
    // Its cut line ends where it starts, or stays open on a "pc" nose without thickness.
    cuts: rib.cut,
    closedCut: false,
    references: [
      { title: 'Nylon rod', lines: rib.rods.flatMap((rod) => rod.edges) },
      { title: 'Nose mylar', lines: rib.mylar ? [rib.mylar.edge] : [] },
      // The cutting table repeats some of them.
      { title: 'V-rib seam', lines: rib.vRibs.lines },
    ],
    table: [
      { title: 'Anchor', ...rib.anchors },
      { title: 'Air inlet end', ...rib.inlets },
      { title: 'Rib point', dots: rib.points, lines: [] },
      {
        title: 'Rod end',
        dots: rib.rods.flatMap((rod) => rod.edges.flatMap((edge) => [edge[0], edge.at(-1)!])),
        lines: [],
      },
      { title: 'Mylar end', dots: [], lines: rib.mylar?.ends ?? [] },
      { title: 'V-rib mark', dots: rib.vRibs.table.dots, lines: [] },
    ],
  }));
  // After the ribs: the engine draws each between the rib it is cut on and the next.
  const miniribs = miniribPatterns(design, airfoils).map((minirib): Piece => ({
    ...minirib,
    number: `m${minirib.rib}`,
    title: `Minirib ${minirib.rib}`,
    cuts: minirib.cut,
    closedCut: false,
    references: [],
    marks: [],
    table: [],
  }));
  const unloaded = unloadedRibPatterns(design, airfoils).map((rib): Piece => ({
    ...rib,
    number: `u${rib.rib}`,
    title: `Unloaded rib ${rib.rib}`,
    cuts: [rib.cut],
    closedCut: false,
    references: [],
    table: [{ title: 'Air inlet end', dots: rib.inlets, lines: [] }],
  }));
  return [...ribs, ...miniribs, ...unloaded];
}

/** The pockets of a rib's rods, lettered when it has several, and its nose mylar. */
function reinforcementPieces(
  design: Pick<LepDesign, RibPatternSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
): Piece[] {
  const piece = (
    number: string,
    title: string,
    outline: readonly Point[],
    numeral: readonly Point[],
  ): Piece => ({
    number,
    title,
    sewing: outline,
    cuts: [],
    closedCut: true,
    references: [],
    holes: [],
    marks: [],
    numeral,
    table: [],
  });
  return ribPatterns(design, airfoils).flatMap(({ rib, rods, mylar }) => [
    ...rods.map((rod, k) => {
      const number = `${rib + 1}${rods.length > 1 ? String.fromCharCode(97 + k) : ''}`;
      return piece(number, `Rod pocket ${number}, type ${rod.type}`, rod.pocket, rod.numeral);
    }),
    // Enhanced v1 closes the mylar in one line.
    ...(mylar
      ? [piece(`M${rib + 1}`, `Nose mylar ${rib + 1}`, mylar.outline.flat(), mylar.numeral)]
      : []),
  ]);
}

function vRibPieces(
  design: Pick<LepDesign, VRibPatternSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
): Piece[] {
  return vRibPatterns(design, airfoils).map((piece) => {
    const number = piece.ribs.join('-');
    return {
      ...piece,
      number,
      title: piece.type === 1 ? `H strap ${number}` : `V-rib ${number}, type ${piece.type}`,
      // The engine draws the cut lines of a strip as its edges and end rows.
      cuts: piece.cut,
      closedCut: false,
      references: [],
      table: [],
    };
  });
}

const PANELS =
  'Dots spell the cell number in roman numerals; red marks are made on the cutting table. A letter after a number: a piece between 3D-shaping cuts.';

const DESCRIPTIONS: Record<PatternGroup, string> = {
  extrados: PANELS,
  intrados: PANELS,
  ribs: 'Dots spell the rib number in roman numerals; red marks are made on the cutting table. m: minirib, u: unloaded rib.',
  vribs:
    'Numbered by their ribs. Dots spell the numbers of the ribs and anchor rows in roman numerals. H straps are shortened by their strain.',
  reinforcements:
    'Numbered by their ribs, lettered on a rib with several rods. Dots spell the rib number in roman numerals. M: nose mylar.',
};

function emptyMessage(design: Pick<LepDesign, 'geometry'>, group: PatternGroup) {
  if (group === 'intrados' && design.geometry.paragliderType === 'ss')
    return 'A single-skin wing has no intrados panels.';
  if (group === 'vribs') return 'Section 12 sets no H straps or V-ribs drawn here.';
  if (group === 'reinforcements') return 'Sections 21 and 22 set no rods or nose mylars.';
  return 'The pieces need valid ribs and airfoils with matching points.';
}

/** A panel's number as the engine's, its pieces between 3D-shaping cuts lettered from its first point. */
export function panelNumber(panels: readonly SkinPanel[], panel: SkinPanel): string {
  const split = panels.some(
    (other) => other.cell === panel.cell && other.surface === panel.surface && other.piece > 0,
  );
  return `${panel.cell + 1}${split ? 'abc'[panel.piece] : ''}`;
}
