import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { ASSEMBLY_LAYERS, assembly, type AssemblyLayer, type SeamCheck } from '@lepara/views';
import { SEAM_CONVENTIONS } from '@lepara/design';
import { CAMERA_VIEWS } from './camera-views';
import { EditorState } from './editor-state';
import { ModelPreview } from './model-preview';

/** A cell of the draft, from its patterns laid flat to their pieces sewn on the wing. */
@Component({
  selector: 'app-assembly-overview',
  imports: [DecimalPipe, MatIconButton, MatIcon, MatTooltip, ModelPreview],
  template: `
    <div class="toolbar">
      <h3>Assembly</h3>
      <select aria-label="Cell" (change)="choose(+$any($event.target).value)">
        @for (entry of cells(); track entry.cell) {
          <option [value]="entry.cell" [selected]="entry.cell === cell()">
            Cell {{ entry.cell + 1 }}{{ entry.faults ? ' · ' + entry.faults + ' off' : '' }}
          </option>
        }
      </select>
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
      [opening]="1 - assembled() / 100"
    >
      <div class="layers" role="group" aria-label="Layers">
        <label for="assembled">Assembled</label>
        <div class="range">
          <input
            id="assembled"
            type="range"
            min="0"
            max="100"
            step="1"
            [attr.aria-valuetext]="assembled() + '% assembled'"
            [value]="assembled()"
            (input)="assembled.set($any($event.target).valueAsNumber)"
          />
          <output>{{ assembled() }}%</output>
        </div>
        @if (model().grid; as grid) {
          <p class="sound">Grid {{ grid.length }} cm</p>
        }
        @for (layer of layers; track layer[0]) {
          <label
            ><input
              type="checkbox"
              [checked]="visible().has(layer[0])"
              (change)="toggle(layer[0])"
            />{{ layer[1] }}</label
          >
        }
        @if (faults().length) {
          <ul class="faults" aria-label="Seams off">
            @for (fault of faults(); track fault.seam) {
              <li>
                {{ fault.seam }}: {{ fault.difference * 10 | number: '1.0-1' }} mm, marks
                {{ fault.marks * 10 | number: '1.0-1' }} mm
              </li>
            }
          </ul>
        } @else {
          <p class="sound">All seams match within {{ tolerance * 10 }} mm.</p>
        }
        @if (stretches()) {
          <p class="sound">
            Ballooned by section {{ pieces().overwidthSection }}, longer mid-cell than cut:
            {{ stretches() }}.
          </p>
        }
      </div>
    </app-model-preview>
  `,
  styleUrl: './overview.css',
  styles: `
    .faults,
    .sound {
      margin: 0 0 0 4px;
      padding: 0;
      list-style: none;
      font: var(--mat-sys-body-small);
    }
    .faults {
      color: var(--mat-sys-error);
    }
  `,
})
export class AssemblyOverview {
  readonly active = input.required<boolean>();
  private readonly editor = inject(EditorState);
  protected readonly tolerance = SEAM_CONVENTIONS.seamTolerance;
  protected readonly layers = ASSEMBLY_LAYERS;
  // Three-quarter from higher up, to read the pieces on their table.
  protected readonly cameras = CAMERA_VIEWS.map(
    ([key, label, direction]): (typeof CAMERA_VIEWS)[number] =>
      key === 'perspective' ? [key, label, [1.3, -1, -0.8]] : [key, label, direction],
  );
  protected readonly visible = signal<ReadonlySet<AssemblyLayer>>(
    new Set(['extrados', 'intrados', 'rib', 'minirib', 'vrib', 'lines']),
  );
  protected readonly camera = signal('perspective');
  protected readonly fitRequest = signal(0);
  // Keep the last pieces while hidden, without recomputing them on each keystroke.
  private readonly pieces = linkedSignal<boolean, ReturnType<typeof assembly>>({
    source: this.active,
    computation: (active, previous) => {
      if (!active && previous) return previous.value;
      const { design, airfoils } = this.editor.draft.project();
      return assembly(design, airfoils);
    },
  });
  private readonly off = ({ difference, marks }: SeamCheck) =>
    Math.abs(difference) > this.tolerance || marks > this.tolerance;
  protected readonly cells = computed(() => {
    const pieces = this.pieces();
    return pieces.cells.map((cell) => ({
      cell,
      faults: pieces.checks(cell).filter(this.off).length,
    }));
  });
  /** The first cell at first, or the chosen one while the draft keeps it. */
  protected readonly chosen = signal<number | undefined>(undefined);
  protected readonly cell = computed(() => {
    const cells = this.cells();
    const chosen = this.chosen();
    return cells.some((entry) => entry.cell === chosen) ? chosen! : (cells[0]?.cell ?? 0);
  });
  /** From the patterns laid flat, at 0, to the pieces sewn on the wing. */
  protected readonly assembled = signal(0);
  protected readonly model = computed(() => ({
    ...this.pieces().model(this.cell(), this.visible()),
    camera: this.cameras.find(([key]) => key === this.camera())?.[2],
  }));
  protected readonly faults = computed(() => this.pieces().checks(this.cell()).filter(this.off));
  protected readonly stretches = computed(() =>
    this.pieces()
      .stretches(this.cell())
      .map(({ surface, stretch }) => `${surface} ${(stretch * 100).toFixed(1)}%`)
      .join(', '),
  );
  protected toggle(layer: AssemblyLayer): void {
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
  protected choose(cell: number): void {
    this.chosen.set(cell);
    this.fit();
  }
  protected setCamera(camera: string): void {
    this.camera.set(camera);
    this.fit();
  }
}
