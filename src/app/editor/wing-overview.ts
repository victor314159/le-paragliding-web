import { Component, computed, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import {
  OVERVIEW_LAYERS,
  overviewRibs,
  wingOverviewLayers,
  wingOverviewModel,
  type OverviewLayer,
} from '@lepara/views';
import { CAMERA_VIEWS } from './camera-views';
import { EditorState } from './editor-state';
import { ModelPreview } from './model-preview';

/** Full-size assembled draft, with independently switchable details. */
@Component({
  selector: 'app-wing-overview',
  imports: [MatIconButton, MatIcon, MatTooltip, ModelPreview],
  template: `
    <div class="toolbar">
      <h3>Wing overview</h3>
      <select aria-label="Camera view" (change)="setCamera($any($event.target).value)">
        @for (view of cameras; track view[0]) {
          <option [value]="view[0]" [selected]="view[0] === camera()">{{ view[1] }}</option>
        }
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
      class="preview"
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
        <div class="range">
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
          @if (layer[0] === 'ribs' && singleSkin()) {
            <label
              matTooltip="Interpolates rib fabric towards the engine's attachment points. No forces or fabric properties are simulated."
              ><input
                type="checkbox"
                [checked]="estimateRibDeformation()"
                [disabled]="!visible().has('ribs')"
                (change)="estimateRibDeformation.set(!estimateRibDeformation())"
              />Illustrative rib deformation</label
            >
          }
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
  styleUrl: './overview.css',
  styles: `
    .empty {
      margin: 0 0 8px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class WingOverview {
  readonly active = input.required<boolean>();
  private readonly editor = inject(EditorState);
  protected readonly layers = OVERVIEW_LAYERS.filter(([key]) => key !== 'skin');
  protected readonly cameras = CAMERA_VIEWS;
  protected readonly visible = signal<ReadonlySet<OverviewLayer>>(
    new Set(['skin', 'colors', 'ribs', 'structure', 'lines', 'rods']),
  );
  protected readonly ballooning = signal(true);
  protected readonly estimateRibDeformation = signal(true);
  protected readonly singleSkin = computed(
    () => this.editor.draft.project().design.geometry.paragliderType === 'ss',
  );
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
  // Toggling the rib deformation rebuilds the ribs alone, of the draft the drawings show.
  private readonly ribs = computed(() => {
    const { ribs } = this.drawings();
    if (this.estimateRibDeformation()) return ribs;
    const { design, airfoils } = untracked(this.editor.draft.project);
    return overviewRibs(design, airfoils, false);
  });
  protected readonly model = computed(() => ({
    ...wingOverviewModel({ ...this.drawings(), ribs: this.ribs() }, this.visible()),
    title: this.drawings().skin.title,
    camera: CAMERA_VIEWS.find(([key]) => key === this.camera())?.[2],
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
