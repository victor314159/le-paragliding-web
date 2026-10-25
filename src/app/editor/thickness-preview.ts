import { Component, computed, inject } from '@angular/core';
import { finite, pointPath, previewBounds, ribProfile } from '@lepara/views';
import { EditorState } from './editor-state';
import { PreviewViewport } from './preview-viewport';

@Component({
  selector: 'app-thickness-preview',
  imports: [PreviewViewport],
  template: `
    <figure>
      <figcaption>Airfoil thickness · original and modified</figcaption>
      <div class="preview-controls">
        <label
          >Preview rib
          <select
            aria-label="Preview rib"
            [value]="row()"
            (change)="select(+$any($event.target).value)"
          >
            @for (rib of editor.draft.value().airfoils; track $index) {
              <option [value]="$index">Rib {{ $index + 1 }}</option>
            }
          </select>
        </label>
        <span>{{ data().name }} · coefficient {{ data().coefficient ?? 'unavailable' }}</span>
      </div>
      @if (data().original) {
        <svg
          [appPreviewViewport]="data().viewBox"
          role="img"
          [attr.aria-label]="'Original and modified airfoil of rib ' + (row() + 1)"
        >
          <line class="chord" x1="0" x2="1" y1="0" y2="0" />
          <path class="modified" [attr.d]="data().modified" />
          <path class="original" [attr.d]="data().original" />
        </svg>
        <p>
          Dashed: original · Solid: modified · Input profile, % chord.
          @if (!data().enabled) {
            Thickness modification is disabled.
          }
          @if (data().coefficient === null) {
            Enter a coefficient to see the modified profile.
          }
        </p>
      } @else {
        <p>Airfoil coordinates are unavailable for this rib.</p>
      }
    </figure>
  `,
  styleUrls: ['./preview-layout.css', './preview.css'],
  styles: `
    .modified {
      fill: var(--mat-sys-secondary-container);
      stroke: var(--mat-sys-primary);
      stroke-width: 2;
    }
    .original {
      fill: none;
      stroke: var(--mat-sys-tertiary);
      stroke-width: 1.5;
      stroke-dasharray: 6 4;
    }
  `,
})
export class ThicknessPreview {
  protected readonly editor = inject(EditorState);
  protected readonly row = computed(() =>
    this.editor.selectedRecord(this.editor.form.thickness.ribs),
  );
  protected select(index: number): void {
    this.editor.selectRecord(this.editor.form.thickness.ribs, index);
  }
  protected readonly data = computed(() => {
    const { design, airfoils } = this.editor.draft.project();
    const profile = ribProfile(design, airfoils, this.row());
    const original = ribProfile({ ...design, thickness: { mode: 0 } }, airfoils, this.row());
    const coefficient = design.thickness.mode === 0 ? 1 : design.thickness.ribs[this.row()];
    return {
      name: profile.name,
      enabled: design.thickness.mode === 1,
      coefficient: finite(coefficient) ? coefficient : null,
      original: pointPath(original.points),
      modified: finite(coefficient) ? pointPath(profile.points) : '',
      ...previewBounds([
        [0, -0.08],
        [1, 0.08],
        ...original.points,
        ...(finite(coefficient) ? profile.points : []),
      ]),
    };
  });
}
