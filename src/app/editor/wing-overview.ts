import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import {
  OVERVIEW_LAYERS,
  wingOverviewLayers,
  wingOverviewModel,
  type OverviewLayer,
} from '@lepara/views';
import type { Point3 } from '@lepara/geometry';
import { EditorState } from './editor-state';
import { ModelPreview } from './model-preview';

/** Full-size assembled draft, with independently switchable details. */
@Component({
  selector: 'app-wing-overview',
  imports: [MatIconButton, MatIcon, MatTooltip, ModelPreview],
  template: `
    <div class="toolbar">
      <h3>Wing overview</h3>
      <select
        aria-label="Camera view"
        [value]="camera()"
        (change)="setCamera($any($event.target).value)"
      >
        <option value="perspective">Three-quarter</option>
        <option value="front">Front</option>
        <option value="top">Top</option>
        <option value="side">Side</option>
      </select>
      <button
        matIconButton
        type="button"
        aria-label="Fit view"
        matTooltip="Fit view"
        (click)="fit()"
      >
        <mat-icon svgIcon="fit_screen" />
      </button>
    </div>
    <app-model-preview
      [model]="model()"
      [fitRequest]="fitRequest()"
      [skinCoverage]="skinCoverage()"
    >
      <div class="layers" role="group" aria-label="Layers">
        <label
          ><input
            type="checkbox"
            [checked]="skinCoverage() > 0"
            (change)="setSkinCoverage(skinCoverage() ? 0 : 100)"
          />Skin</label
        >
        <div class="skin-cut">
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            aria-label="Skin coverage"
            [attr.aria-valuetext]="skinCoverage() + '% skin coverage'"
            [value]="skinCoverage()"
            (input)="setSkinCoverage($any($event.target).valueAsNumber)"
          />
          <output>{{ skinCoverage() }}%</output>
        </div>
        <label
          ><input
            type="checkbox"
            [checked]="ballooning()"
            (change)="ballooning.set(!ballooning())"
          />Ballooning</label
        >
        @for (layer of layers; track layer[0]) {
          <label
            ><input
              type="checkbox"
              [checked]="visible().has(layer[0])"
              (change)="toggle(layer[0])"
            />{{ layer[1] }}</label
          >
        }
      </div>
      @if (
        !model().surfaces.length &&
        !model().fills.length &&
        !model().lines.length &&
        !model().dots.length
      ) {
        <p class="empty">Select a layer with geometry to display the wing.</p>
      }
    </app-model-preview>
  `,
  styles: `
    :host {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      background: var(--mat-sys-surface-container-low);
    }
    :host([hidden]) {
      display: none;
    }
    .toolbar {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px 16px;
      padding: 12px 24px;
    }
    h3 {
      flex: 1;
      margin: 0;
      font: var(--mat-sys-title-medium);
    }
    select {
      cursor: pointer;
      font: var(--mat-sys-body-medium);
      max-width: 100%;
      padding: 6px;
      border: 1px solid var(--mat-sys-outline);
      border-radius: 4px;
      color: var(--mat-sys-on-surface);
      background: var(--mat-sys-surface);
    }
    .layers {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      width: max-content;
      max-width: 100%;
      text-shadow:
        0 0 2px var(--mat-sys-surface-container-low),
        0 0 4px var(--mat-sys-surface-container-low);
      margin-block: 8px;
    }
    label {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 28px;
      min-width: 0;
      padding: 2px 0;
      font: var(--mat-sys-body-small);
      cursor: pointer;
      pointer-events: auto;
    }
    .skin-cut {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 190px;
      margin: 0 0 4px 4px;
      pointer-events: auto;
      font: var(--mat-sys-body-small);
    }
    .skin-cut input {
      width: 140px;
      margin: 0;
    }
    .skin-cut output {
      min-width: 38px;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    input {
      accent-color: var(--mat-sys-primary);
    }
    app-model-preview {
      flex: 1;
      min-height: 0;
      padding: 0 24px 12px;
    }
    .empty {
      margin: 0 0 8px;
      color: var(--mat-sys-on-surface-variant);
    }
    @media (max-width: 700px) {
      .toolbar {
        padding: 8px 16px;
        gap: 8px;
      }
      h3 {
        flex-basis: 100%;
      }
      app-model-preview {
        padding-inline: 16px;
      }
    }
  `,
})
export class WingOverview {
  readonly active = input.required<boolean>();
  private readonly editor = inject(EditorState);
  protected readonly layers = OVERVIEW_LAYERS.filter(([key]) => key !== 'skin');
  protected readonly visible = signal<ReadonlySet<OverviewLayer>>(
    new Set(['skin', 'colors', 'ribs', 'structure', 'lines', 'rods']),
  );
  protected readonly ballooning = signal(true);
  protected readonly skinCoverage = signal(80);
  protected readonly camera = signal('perspective');
  protected readonly fitRequest = signal(0);
  // Preserve the view while hidden without rebuilding the whole wing on each keystroke.
  private readonly drawings = linkedSignal<boolean, ReturnType<typeof wingOverviewLayers>>({
    source: this.active,
    computation: (active, previous) => {
      if (!active && previous) return previous.value;
      const { design, airfoils } = this.editor.draft.project();
      return wingOverviewLayers(design, airfoils, this.ballooning());
    },
  });
  protected readonly model = computed(() => ({
    ...wingOverviewModel(this.drawings(), this.visible()),
    title: this.drawings().skin.title,
    camera: (
      {
        perspective: [1.3, -1, -0.2],
        front: [0, -1, 0],
        top: [0, 0, -1],
        side: [1, 0, 0],
      } as Record<string, Point3>
    )[this.camera()],
  }));
  protected setSkinCoverage(value: number): void {
    const coverage = Math.min(100, Math.max(0, value));
    this.skinCoverage.set(coverage);
    if (this.visible().has('skin') === coverage > 0) return;
    this.visible.update((visible) => {
      const next = new Set(visible);
      if (coverage) next.add('skin');
      else next.delete('skin');
      return next;
    });
  }
  protected toggle(layer: OverviewLayer): void {
    this.visible.update((visible) => {
      const next = new Set(visible);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  }
  protected fit(): void {
    this.fitRequest.update((value) => value + 1);
  }
  protected setCamera(camera: string): void {
    this.camera.set(camera);
    this.fit();
  }
}
