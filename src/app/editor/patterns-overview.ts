import { Component, inject, input, linkedSignal, signal } from '@angular/core';
import { cuttingScene, PATTERN_GROUPS, type PatternGroup, type PreviewScene } from '@lepara/views';
import { EditorState } from './editor-state';
import { ScenePreview } from './scene-preview';

/** The cutting patterns of the draft, one group of pieces at a time. */
@Component({
  selector: 'app-patterns-overview',
  imports: [ScenePreview],
  template: `
    <div class="toolbar">
      <h3>Cutting patterns</h3>
      <select aria-label="Pieces" [value]="group()" (change)="group.set($any($event.target).value)">
        @for (entry of groups; track entry[0]) {
          <option [value]="entry[0]">{{ entry[1] }}</option>
        }
      </select>
    </div>
    <app-scene-preview class="preview" [scene]="scene()">
      <div class="layers" role="group" aria-label="Layers">
        <label
          ><input
            type="checkbox"
            [checked]="enlargeMarks()"
            (change)="enlargeMarks.set(!enlargeMarks())"
          />Enlarge marks</label
        >
      </div>
    </app-scene-preview>
  `,
  styleUrl: './overview.css',
})
export class PatternsOverview {
  readonly active = input.required<boolean>();
  private readonly editor = inject(EditorState);
  protected readonly groups = PATTERN_GROUPS;
  protected readonly group = signal<PatternGroup>('extrados');
  protected readonly enlargeMarks = signal(false);
  // Keep the last patterns while hidden, without redrawing them on each keystroke.
  protected readonly scene = linkedSignal<boolean, PreviewScene>({
    source: this.active,
    computation: (active, previous) => {
      if (!active && previous) return previous.value;
      const { design, airfoils } = this.editor.draft.project();
      return cuttingScene(design, airfoils, this.group(), this.enlargeMarks());
    },
  });
}
