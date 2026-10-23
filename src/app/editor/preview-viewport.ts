import {
  afterNextRender,
  afterRenderEffect,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { EditorState } from './editor-state';

type Box = { x: number; y: number; width: number; height: number };
const parseBox = (value: string): Box => {
  const [x, y, width, height] = value.split(/\s+/).map(Number);
  return [x, y, width, height].every(Number.isFinite) && width > 0 && height > 0
    ? { x, y, width, height }
    : { x: 0, y: 0, width: 1, height: 1 };
};

/** Shared SVG wheel zoom, captured-pointer pan and fit controls. */
@Directive({
  selector: 'svg[appPreviewViewport]',
  host: {
    '[attr.viewBox]': 'viewBox()',
    '[style.touch-action]': '"none"',
    '[style.cursor]': 'dragging() ? "grabbing" : "grab"',
    '(wheel)': 'wheel($event)',
    '(pointerdown)': 'start($event)',
    '(pointermove)': 'move($event)',
    '(pointerup)': 'end($event)',
    '(pointercancel)': 'end($event)',
    '(lostpointercapture)': 'dragging.set(false)',
    '(dblclick)': 'fit()',
  },
})
export class PreviewViewport {
  readonly appPreviewViewport = input.required<string>();
  private readonly editor = inject(EditorState);
  private readonly svg = inject<ElementRef<SVGSVGElement>>(ElementRef).nativeElement;
  private readonly destroy = inject(DestroyRef);
  private readonly box = signal<Box>({ x: 0, y: 0, width: 1, height: 1 });
  protected readonly dragging = signal(false);
  private drag?: { x: number; y: number; box: Box; inverse: DOMMatrix };
  private fitted = true;
  private fittedBox?: Box;
  protected viewBox(): string {
    const box = this.box();
    return `${box.x} ${box.y} ${box.width} ${box.height}`;
  }

  constructor() {
    afterRenderEffect({
      read: () => {
        this.appPreviewViewport();
        this.editor.previewFitRequest();
        untracked(() => this.fit());
      },
    });
    afterNextRender(() => {
      const observer = new ResizeObserver(() => {
        if (this.fitted) this.fit();
      });
      observer.observe(this.svg);
      this.destroy.onDestroy(() => observer.disconnect());
    });
  }

  protected fit(): void {
    let box = parseBox(this.appPreviewViewport());
    const viewport = this.svg.getBoundingClientRect();
    try {
      // Measure rendered paths, markers and text, rather than the scene's padded frame.
      const drawing = this.svg.getBBox();
      if (
        [drawing.x, drawing.y, drawing.width, drawing.height].every(Number.isFinite) &&
        (drawing.width > 0 || drawing.height > 0) &&
        viewport.width > 12 &&
        viewport.height > 12
      ) {
        // A small screen-space inset protects strokes without shrinking long, thin drawings.
        const padding =
          6 *
          Math.max(drawing.width / (viewport.width - 12), drawing.height / (viewport.height - 12));
        box = {
          x: drawing.x - padding,
          y: drawing.y - padding,
          width: drawing.width + 2 * padding,
          height: drawing.height + 2 * padding,
        };
      }
    } catch {
      // Hidden or unavailable SVG geometry keeps the scene's finite fallback frame.
    }
    this.fitted = true;
    this.fittedBox = box;
    this.box.set(box);
  }
  private zoom(factor: number, point?: DOMPoint): void {
    const box = this.box();
    const base = this.fittedBox ?? parseBox(this.appPreviewViewport());
    const width = Math.max(base.width / 20, Math.min(base.width * 4, box.width * factor));
    const ratio = width / box.width;
    const center = point ?? new DOMPoint(box.x + box.width / 2, box.y + box.height / 2);
    this.fitted = false;
    this.box.set({
      x: center.x + (box.x - center.x) * ratio,
      y: center.y + (box.y - center.y) * ratio,
      width,
      height: box.height * ratio,
    });
  }
  protected wheel(event: WheelEvent): void {
    event.preventDefault();
    const matrix = this.svg.getScreenCTM();
    if (matrix)
      this.zoom(
        Math.exp(Math.max(-500, Math.min(500, event.deltaY)) * 0.002),
        new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()),
      );
  }
  protected start(event: PointerEvent): void {
    if (!event.isPrimary || event.button !== 0) return;
    const matrix = this.svg.getScreenCTM();
    if (!matrix) return;
    this.drag = { x: event.clientX, y: event.clientY, box: this.box(), inverse: matrix.inverse() };
    this.dragging.set(true);
    this.svg.setPointerCapture(event.pointerId);
  }
  protected move(event: PointerEvent): void {
    if (!this.dragging() || !this.drag) return;
    const start = new DOMPoint(this.drag.x, this.drag.y).matrixTransform(this.drag.inverse);
    const current = new DOMPoint(event.clientX, event.clientY).matrixTransform(this.drag.inverse);
    if (start.x === current.x && start.y === current.y) return;
    this.fitted = false;
    this.box.set({
      ...this.drag.box,
      x: this.drag.box.x + start.x - current.x,
      y: this.drag.box.y + start.y - current.y,
    });
  }
  protected end(event: PointerEvent): void {
    this.dragging.set(false);
    if (this.svg.hasPointerCapture(event.pointerId))
      this.svg.releasePointerCapture(event.pointerId);
  }
}
