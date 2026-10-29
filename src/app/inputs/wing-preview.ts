import { Component, computed, inject, linkedSignal, output } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatCard } from '@angular/material/card';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import type { Point3 } from '@lepara/geometry';
import { wingOverviewLayers, wingOverviewModel, type OverviewLayer } from '@lepara/views';
import { ComputeService } from '../compute/compute.service';
import { ModelPreview } from '../editor/model-preview';
import { DesignFilesService } from './design-files.service';

/** Live wing geometry from the input project, independent of the engine. */
@Component({
  selector: 'app-wing-preview',
  imports: [MatCard, MatIcon, MatIconButton, MatTooltip, ModelPreview],
  template: `
    <mat-card appearance="outlined">
      <div class="toolbar">
        <h2 class="mat-font-title-lg">3D Preview</h2>
        <button
          matIconButton
          type="button"
          aria-label="Expand 3D preview"
          matTooltip="Expand 3D preview"
          [disabled]="!model() || inputs.pending() || compute.busy()"
          (click)="expand.emit()"
        >
          <mat-icon svgIcon="open_in_full" />
        </button>
      </div>
      @if (model(); as model) {
        <app-model-preview [model]="model" [skinCoverage]="70" [fitRequest]="fitRequest()" />
      } @else {
        <p class="empty mat-text-on-surface-variant">
          {{ inputs.pending() ? 'Loading wing…' : 'Load a readable design to preview the wing.' }}
        </p>
      }
    </mat-card>
  `,
  styles: `
    :host {
      display: flex;
      min-width: 0;
      min-height: 480px;
      contain: size;
    }
    mat-card {
      flex: 1;
      min-width: 0;
      background: var(--mat-sys-surface-container-low);
    }
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 12px 16px;
    }
    h2 {
      margin: 0;
    }
    app-model-preview {
      flex: 1;
      padding: 0 16px 16px;
    }
    .empty {
      margin: 16px;
    }
    @media (max-width: 900px) {
      :host {
        height: 480px;
        contain: none;
      }
    }
  `,
})
export class WingPreview {
  readonly expand = output();
  protected readonly inputs = inject(DesignFilesService);
  protected readonly compute = inject(ComputeService);
  /** Refit on source changes while preserving the camera during edits to the same wing. */
  protected readonly fitRequest = linkedSignal<string, number>({
    source: this.inputs.sourceId,
    computation: (_, previous) => (previous?.value ?? 0) + 1,
  });
  private readonly layers: ReadonlySet<OverviewLayer> = new Set([
    'skin',
    'colors',
    'ribs',
    'structure',
    'lines',
    'rods',
  ]);
  protected readonly model = computed(() => {
    const project = this.inputs.reading().project;
    if (!project) return undefined;
    const drawings = wingOverviewLayers(project.design, project.airfoils, true);
    return {
      ...wingOverviewModel(drawings, this.layers),
      title: drawings.skin.title,
      legend: [],
      note: '',
      camera: [1.3, -1, -0.2] satisfies Point3,
    };
  });
}
