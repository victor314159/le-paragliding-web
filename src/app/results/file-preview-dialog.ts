import {
  afterNextRender,
  Component,
  DestroyRef,
  type ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';
import type { DxfViewer } from 'dxf-viewer';
import type { ResultFile } from '../compute/compute.service';
import { themeColor } from '../shared/theme-color';
import type {
  PreviewDrawing,
  PreviewDrawingRequest,
  PreviewDrawingResult,
} from './preview-geometry';
import type { PreviewScene } from './preview-scene';

const TEXT_LIMIT = 200_000;

/** Text, airfoil, DXF or STL preview of one generated file. */
@Component({
  selector: 'app-file-preview-dialog',
  imports: [MatButton, MatIcon, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle],
  templateUrl: './file-preview-dialog.html',
  styleUrl: './file-preview-dialog.css',
})
export class FilePreviewDialog {
  protected readonly file = inject<ResultFile>(MAT_DIALOG_DATA);
  private readonly destroyRef = inject(DestroyRef);
  private readonly viewport = viewChild.required<ElementRef<HTMLDivElement>>('viewport');
  protected readonly extension = this.file.name.split('.').at(-1)?.toLowerCase() ?? '';
  protected readonly graphical = this.extension === 'dxf' || this.extension === 'stl';
  // The 2D cutting patterns open in dxf-viewer; other drawings are 3D scenes.
  private readonly patterns = this.file.name.endsWith('leparagliding.dxf');
  protected readonly controlsHint = this.patterns
    ? 'Drag to pan · Scroll or pinch to zoom'
    : 'Drag to rotate · Right-drag to pan · Scroll or pinch to zoom';
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly text = signal('');
  protected readonly truncated = signal(false);
  protected readonly notice = signal('');
  protected readonly profile = signal('');
  private scene?: PreviewScene;
  private dxfViewer?: DxfViewer;
  private worker?: Worker;
  private readonly abort = new AbortController();

  constructor() {
    afterNextRender(() => void this.load());
    this.destroyRef.onDestroy(() => {
      this.abort.abort();
      this.worker?.terminate();
      this.scene?.dispose();
      this.dxfViewer?.Destroy();
    });
  }

  protected reset(): void {
    this.scene?.reset();
    const bounds = this.dxfViewer?.GetBounds();
    const origin = this.dxfViewer?.GetOrigin();
    if (bounds && origin)
      this.dxfViewer?.FitView(
        bounds.minX - origin.x,
        bounds.maxX - origin.x,
        bounds.minY - origin.y,
        bounds.maxY - origin.y,
      );
  }

  private async load(): Promise<void> {
    try {
      const response = await fetch(this.file.url, { signal: this.abort.signal });
      if (!response.ok) throw new Error('Could not read this file.');
      const bytes = await response.arrayBuffer();
      if (this.destroyRef.destroyed) return;
      if (!this.graphical) {
        this.text.set(new TextDecoder().decode(bytes.slice(0, TEXT_LIMIT)));
        this.truncated.set(bytes.byteLength > TEXT_LIMIT);
        if (this.extension === 'dat') this.makeProfile(this.text());
      }
      if (this.patterns) {
        await this.loadDxfViewer();
      } else if (this.graphical) {
        const drawing = this.extension === 'dxf' ? await this.parseDxf(this.file.url) : undefined;
        if (this.destroyRef.destroyed) return;
        const { PreviewScene } = await import('./preview-scene');
        if (this.destroyRef.destroyed) return;
        this.scene = new PreviewScene(
          this.viewport().nativeElement,
          this.color('--mat-sys-surface'),
        );
        if (drawing) {
          this.scene.loadDrawing(drawing);
          if (drawing.skipped)
            this.notice.set(
              `${drawing.skipped} invalid or unsupported elements omitted. Download the file to inspect all elements.`,
            );
        } else {
          this.scene.loadStl(bytes);
        }
      }
    } catch (error: unknown) {
      if (this.destroyRef.destroyed) return;
      this.scene?.dispose();
      this.scene = undefined;
      this.dxfViewer?.Destroy();
      this.dxfViewer = undefined;
      this.error.set(error instanceof Error ? error.message : 'Could not preview this file.');
    } finally {
      if (!this.destroyRef.destroyed) this.loading.set(false);
    }
  }

  private async loadDxfViewer(): Promise<void> {
    const [{ DxfViewer }, { Color }] = await Promise.all([import('dxf-viewer'), import('three')]);
    if (this.destroyRef.destroyed) return;
    const viewer = new DxfViewer(this.viewport().nativeElement, {
      autoResize: true,
      clearColor: new Color(this.color('--mat-sys-surface')),
      antialias: true,
      colorCorrection: true,
    });
    this.dxfViewer = viewer;
    if (!viewer.HasRenderer()) throw new Error('WebGL is unavailable in this browser.');
    viewer.GetCanvas().setAttribute('role', 'img');
    viewer.GetCanvas().setAttribute('aria-label', 'File preview');
    viewer.Subscribe('message', (event: { detail: { message: string } }) => {
      if (!this.destroyRef.destroyed) this.notice.set(event.detail.message);
    });
    await viewer.Load({
      url: this.file.url,
      fonts: [new URL('fonts/roboto-latin-400-normal.woff', document.baseURI).href],
      workerFactory: () => {
        const worker = new Worker(new URL('./dxf-viewer.worker', import.meta.url), {
          type: 'module',
        });
        this.worker = worker;
        return worker;
      },
    });
    if (this.destroyRef.destroyed) return;
    // dxf-viewer defaults to 3, which jumps too far between adjacent sheets.
    // Its pinned version exposes sensitivity only through its controls.
    (viewer as DxfViewer & { controls: { zoomSpeed: number } }).controls.zoomSpeed = 0.75;
  }

  private parseDxf(url: string): Promise<PreviewDrawing> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./preview.worker', import.meta.url), { type: 'module' });
      this.worker = worker;
      worker.onmessage = ({ data }: MessageEvent<PreviewDrawingResult>) => {
        worker.terminate();
        this.worker = undefined;
        if ('error' in data) reject(new Error(data.error));
        else resolve(data.drawing);
      };
      worker.onerror = () => {
        worker.terminate();
        this.worker = undefined;
        reject(new Error('Could not load the DXF preview.'));
      };
      worker.postMessage({
        url,
        ink: this.color('--mat-sys-on-surface'),
        accent: this.color('--mat-sys-primary'),
      } satisfies PreviewDrawingRequest);
    });
  }

  private color(token: string): number {
    return themeColor(this.viewport().nativeElement, token);
  }

  private makeProfile(text: string): void {
    const points = text
      .split(/\r?\n/)
      .slice(1)
      .filter((line) => line.trim())
      .map((line) => line.trim().split(/\s+/).map(Number));
    if (
      points.length < 3 ||
      points.some((point) => point.length !== 2 || !point.every(Number.isFinite))
    )
      return;
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const minX = Math.min(...xs);
    const maxY = Math.max(...ys);
    const scale = 900 / Math.max(Math.max(...xs) - minX, (maxY - Math.min(...ys)) * 3, 0.001);
    this.profile.set(
      points
        .map(([x, y], i) => `${i ? 'L' : 'M'}${50 + (x - minX) * scale},${60 + (maxY - y) * scale}`)
        .join(' '),
    );
  }
}
