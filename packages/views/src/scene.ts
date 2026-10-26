import type { WingMetrics } from '@lepara/design';
import type { LepAirfoil, LepDesign } from '@lepara/format';
import { finite, pointPath, previewBounds, ribNumbers, type Point } from './geometry.ts';

/**
 * What a scene draws: the sections `K` of a design, its airfoils by file
 * name, and the chosen view, rib (from 0) and records. Numbers may be
 * missing (null) or invalid while a design is edited: scenes skip them.
 */
export interface PreviewContext<K extends keyof LepDesign = keyof LepDesign> {
  readonly design: Pick<LepDesign, K>;
  readonly airfoils: ReadonlyMap<string, LepAirfoil>;
  readonly view: string;
  readonly rib: number;
  readonly selected: number;
  readonly active: number;
  readonly secondary: number;
  readonly surface: 'upper' | 'lower';
}
/**
 * A drawing in its declared units. `kind` names the style of an item (its
 * CSS class); `color`, when set, is its stroke (paths) or fill (dots), for
 * colors that carry meaning, such as the anchor rows of `legend`.
 */
export interface PreviewScene {
  title: string;
  note: string;
  viewBox: string;
  fontSize: number;
  paths: { d: string; kind: string; selected: boolean; title: string; color?: string }[];
  dots: {
    point: Point;
    radius: number;
    kind: string;
    selected: boolean;
    title: string;
    color?: string;
  }[];
  labels: {
    point: Point;
    text: string;
    anchor: 'start' | 'middle' | 'end';
    fontSize?: number;
    kind: string;
    selected: boolean;
  }[];
  legend: { text: string; color: string }[];
}

/** Drawing primitives shared by the input schematics, all in their declared units. */
export class PreviewDrawing {
  private points: Point[] = [];
  private paths: PreviewScene['paths'] = [];
  private dots: PreviewScene['dots'] = [];
  private labels: PreviewScene['labels'] = [];
  readonly legend: PreviewScene['legend'] = [];
  private readonly title: string;
  private readonly note: string;
  constructor(title: string, note: string) {
    this.title = title;
    this.note = note;
  }
  path(
    points: readonly Point[],
    kind = 'detail',
    selected = false,
    title = '',
    close = false,
    color?: string,
  ): void {
    if (points.length) this.shape(pointPath(points, close), points, kind, selected, title, color);
  }
  /** A path given as SVG data, such as arcs, framed by `bounds`. */
  shape(
    d: string,
    bounds: readonly Point[],
    kind = 'detail',
    selected = false,
    title = '',
    color?: string,
  ): void {
    if (!bounds.every((p) => p.every(finite))) return;
    this.points.push(...bounds);
    this.paths.push({ d, kind, selected, title, color });
  }
  dot(
    point: Point,
    radius: number,
    title = '',
    selected = false,
    kind = 'detail',
    color?: string,
  ): void {
    if (!point.every(finite) || !finite(radius) || radius <= 0) return;
    this.points.push(
      [point[0] - radius, point[1] - radius],
      [point[0] + radius, point[1] + radius],
    );
    this.dots.push({ point, radius, title, selected, kind, color });
  }
  label(
    point: Point,
    text: string,
    anchor: 'start' | 'middle' | 'end' = 'middle',
    fontSize?: number,
    kind = '',
    selected = false,
  ): void {
    if (!point.every(finite)) return;
    this.points.push(point);
    this.labels.push({ point, text, anchor, fontSize, kind, selected });
  }
  /** The numbers of `ribs`, set off along their direction; the rib `selected` emphasized. */
  ribNumbers(ribs: Parameters<typeof ribNumbers>[0], fontSize: number, selected?: number): void {
    for (const { point, text, index } of ribNumbers(ribs, fontSize, selected))
      this.label(point, text, 'middle', fontSize, 'rib-number', index === selected);
  }
  frame(points: readonly Point[]): void {
    this.points.push(...points.filter((p) => p.every(finite)));
  }
  finish(): PreviewScene {
    const initial = previewBounds(this.points);
    const width = initial.right - initial.left;
    const height = initial.bottom - initial.top;
    const fontSize = Math.max(Math.min(width * 0.03, height * 0.12), height * 0.09, 0.02);
    const textBounds = this.labels.flatMap(
      ({ point: [x, y], text, anchor, fontSize: size = fontSize }): Point[] => {
        const length = text.length * size * 0.55;
        const left = anchor === 'start' ? x : anchor === 'end' ? x - length : x - length / 2;
        return [
          [left, y - size],
          [left + length, y + size * 0.25],
        ];
      },
    );
    const bounds = previewBounds([...this.points, ...textBounds]);
    return {
      title: this.title,
      note: this.note,
      viewBox: bounds.viewBox,
      fontSize,
      paths: this.paths,
      dots: this.dots,
      labels: this.labels,
      legend: this.legend,
    };
  }
}
export const valueLabel = (value: number | null | undefined, unit = '') =>
  finite(value) ? `${Number(value.toPrecision(5))}${unit}` : '—';
const fixed = (value: number) => value.toFixed(2);

/** Flat and projected span (m), area (m²) and aspect ratio of a wing, and its cells. */
export const metricsNote = (m: WingMetrics, cells: number) =>
  `Flat: ${fixed(m.flatSpan)} m · ${fixed(m.flatArea)} m² · AR ${fixed(m.flatAspectRatio)} · ` +
  `Projected: ${fixed(m.projectedSpan)} m · ${fixed(m.projectedArea)} m² · AR ${fixed(m.projectedAspectRatio)} · ` +
  `${cells} cells`;
export const ellipsePoints = (center: Point, a: number, b: number, angle = 0): Point[] =>
  Array.from({ length: 81 }, (_, i): Point => {
    const theta = (i * Math.PI) / 40;
    return [
      center[0] + a * Math.cos(theta) * Math.cos(angle) - b * Math.sin(theta) * Math.sin(angle),
      center[1] + a * Math.cos(theta) * Math.sin(angle) + b * Math.sin(theta) * Math.cos(angle),
    ];
  });

/** Circular arc through two endpoints with a signed sagitta, also for vertical chords. */
export function arcPoints(a: Point, b: Point, sagitta: number): Point[] {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (!finite(sagitta) || !length) return [];
  if (Math.abs(sagitta) < 1e-10) return [a, b];
  const normal: Point = [-dy / length, dx / length];
  const radius = ((length * length) / 4 + sagitta * sagitta) / (2 * Math.abs(sagitta));
  const center: Point = [
    (a[0] + b[0]) / 2 + normal[0] * (sagitta - Math.sign(sagitta) * radius),
    (a[1] + b[1]) / 2 + normal[1] * (sagitta - Math.sign(sagitta) * radius),
  ];
  const start = Math.atan2(a[1] - center[1], a[0] - center[0]);
  const sweep = -Math.sign(sagitta) * 4 * Math.atan2(2 * Math.abs(sagitta), length);
  return Array.from({ length: 61 }, (_, i): Point => [
    center[0] + radius * Math.cos(start + (sweep * i) / 60),
    center[1] + radius * Math.sin(start + (sweep * i) / 60),
  ]);
}
