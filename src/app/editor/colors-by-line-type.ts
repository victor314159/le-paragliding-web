import { Component, computed, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { EditorState } from './editor-state';

/** Sections 24 and 25: section 37 may give the line colors instead. */
@Component({
  selector: 'app-colors-by-line-type',
  imports: [MatButton],
  template: `
    @if (enabled()) {
      <p class="mat-text-on-surface-variant">
        Section 37, parameter 1341 is enabled: line colors come from Section 34 and override these
        settings.
        <button matButton type="button" (click)="editor.select(37)">View Section 37</button>
      </p>
    }
  `,
})
export class ColorsByLineType {
  protected readonly editor = inject(EditorState);
  protected readonly enabled = computed(() => {
    const special = this.editor.draft.project().design.specialParameters;
    return (
      special.mode === 1 &&
      special.entries.some((entry) => entry.code === 1341 && entry.value === 1)
    );
  });
}
