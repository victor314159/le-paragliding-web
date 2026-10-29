import {
  afterNextRender,
  Component,
  DestroyRef,
  effect,
  type ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { PreviewModel } from '@lepara/views';
import type { PreviewScene } from '../results/preview-scene';
import { ThemeService } from '../shared/theme.service';
import { themeColor } from '../shared/theme-color';

/** A 3D model of @lepara/views, orbiting, kept in view while it changes until fitted again. */
@Component({
  selector: 'app-model-preview',
  template: `
    <figure>
      <figcaption>{{ model().title }}</figcaption>
      @if (model().legend.length) {
        <div class="legend" aria-label="Legend">
          @for (entry of model().legend; track entry.text) {
            <span [style.color]="entry.color">● {{ entry.text }}</span>
          }
        </div>
      }
      <div class="model-controls"><ng-content /></div>
      <div #viewport class="viewport"></div>
      @if (model().note) {
        <p>{{ model().note }}</p>
      }
    </figure>
  `,
  styleUrl: './preview-layout.css',
  styles: `
    /* The model spans the whole figure, under its caption, legend and note. */
    figure {
      display: grid;
      grid-template-rows: auto auto auto minmax(56px, 1fr) auto;
    }
    .model-controls {
      grid-area: 3 / 1;
      z-index: 1;
      pointer-events: none;
    }
    .viewport {
      position: relative;
      grid-area: 1 / 1 / -1 / 1;
      overflow: hidden;
    }
    .viewport ::ng-deep canvas {
      position: absolute;
      inset: 0;
    }
    figcaption,
    .legend,
    p {
      z-index: 1;
      grid-column: 1;
      pointer-events: none;
      text-shadow:
        0 0 2px var(--mat-sys-surface-container-low),
        0 0 4px var(--mat-sys-surface-container-low);
    }
    figcaption {
      grid-row: 1;
    }
    .legend {
      grid-row: 2;
    }
    p {
      grid-row: 5;
    }
  `,
})
export class ModelPreview {
  readonly model = input.required<PreviewModel>();
  readonly skinCoverage = input(100);
  /** A standalone viewer can fit independently of the section preview dock. */
  readonly fitRequest = input(0);
  private readonly theme = inject(ThemeService);
  private readonly viewport = viewChild.required<ElementRef<HTMLDivElement>>('viewport');
  private readonly viewer = signal<PreviewScene | undefined>(undefined);

  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      void import('../results/preview-scene').then(({ PreviewScene }) => {
        if (destroy.destroyed) return;
        // Three-quarter front view, from above: ahead of the leading edge, Y running to the trailing edge.
        const viewer = new PreviewScene(this.viewport().nativeElement, 0, 'Wing 3D model', {
          x: 0.3,
          y: -1,
          z: 0.8,
        });
        destroy.onDestroy(() => viewer.dispose());
        this.viewer.set(viewer);
      });
    });
    let fitted = false;
    let request: number | undefined;
    effect(() => {
      const viewer = this.viewer();
      const model = this.model();
      const fit = this.fitRequest();
      this.theme.scheme();
      if (!viewer) return;
      const color = (token: string) => themeColor(this.viewport().nativeElement, token);
      viewer.loadModel(
        model,
        {
          background: color('--mat-sys-surface-container-low'),
          skin: color('--mat-sys-secondary-container'),
          line: color('--mat-sys-outline'),
          selected: color('--mat-sys-tertiary'),
        },
        !fitted || fit !== request,
      );
      fitted ||= model.lines.length > 0 || model.surfaces.length > 0;
      request = fit;
    });
    // The cut moves in shader uniforms; the wing geometry and camera stay intact.
    effect(() => this.viewer()?.setSkinCoverage(this.skinCoverage()));
  }
}
