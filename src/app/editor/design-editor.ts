import { NgComponentOutlet } from '@angular/common';
import { afterNextRender, Component, computed, inject, Injector } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormRoot } from '@angular/forms/signals';
import { MatButton, MatIconButton } from '@angular/material/button';
import {
  MatDialog,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { DESIGN_FILE, SECTIONS, type Diagnostic } from '@lepara/format';
import { filter } from 'rxjs';
import { diagnosticLabel, withSeverity } from '../shared/diagnostics';
import { EditorState, fieldAt, type DesignEditorResult, type Selection } from './editor-state';
import { SECTION_FORMS } from './sections';

const MANUAL = 'https://www.laboratoridenvol.com/leparagliding/manual.en.html';

/** Where the editor shows a diagnostic: its section or its airfoil; on every page otherwise. */
function placeOf({ section, file }: Diagnostic): Selection | undefined {
  return section ?? (file && file !== DESIGN_FILE ? file : undefined);
}

interface NavigationItem {
  readonly id: Selection;
  readonly label: string;
  readonly note: string;
  readonly errors: number;
}

@Component({
  selector: 'app-discard-changes-dialog',
  imports: [MatButton, MatDialogTitle, MatDialogContent, MatDialogActions, MatDialogClose],
  template: `
    <h2 mat-dialog-title>Discard changes?</h2>
    <mat-dialog-content>Your parameter edits have not been saved.</mat-dialog-content>
    <mat-dialog-actions>
      <button matButton type="button" [mat-dialog-close]="false">Keep editing</button>
      <button matButton="filled" type="button" [mat-dialog-close]="true">Discard changes</button>
    </mat-dialog-actions>
  `,
})
class DiscardChangesDialog {}

/** Edits the parameters of a project in a dialog; closes with the new design, if saved. */
@Component({
  selector: 'app-design-editor',
  imports: [FormRoot, MatButton, MatIconButton, MatIcon, NgComponentOutlet],
  templateUrl: './design-editor.html',
  styleUrl: './design-editor.css',
  providers: [EditorState],
})
export class DesignEditor {
  private readonly ref = inject<MatDialogRef<DesignEditor, DesignEditorResult>>(MatDialogRef);
  private readonly dialogs = inject(MatDialog);
  private readonly injector = inject(Injector);
  protected readonly editor = inject(EditorState);
  protected readonly draft = this.editor.draft;
  protected readonly designFile = DESIGN_FILE;
  protected readonly diagnosticLabel = diagnosticLabel;
  protected readonly sectionForm = computed(() => SECTION_FORMS.get(this.editor.selection()));
  protected readonly title = computed(() => {
    const selected = this.editor.selection();
    return typeof selected === 'number'
      ? `${selected} · ${SECTIONS.find((section) => section.number === selected)?.title ?? ''}`
      : selected;
  });
  protected readonly manualUrl = computed(() => `${MANUAL}#6.${this.editor.selection()}`);
  /** The sections and airfoils, with their error counts: the way to every error. */
  protected readonly navigation = computed(() => {
    const counts = new Map<Selection | undefined, number>();
    for (const error of withSeverity(this.draft.diagnostics(), 'error')) {
      const place = placeOf(error);
      counts.set(place, (counts.get(place) ?? 0) + 1);
    }
    const item = (id: Selection, label: string): NavigationItem => {
      const errors = counts.get(id) ?? 0;
      const note = SECTION_FORMS.has(id) ? '' : 'Text only';
      const count = errors ? `${errors} ${errors === 1 ? 'error' : 'errors'}` : '';
      return { id, label, errors, note: [note, count].filter(Boolean).join(' · ') };
    };
    const { design } = this.draft.project();
    return [
      {
        title: 'Sections',
        items: SECTIONS.map(({ number, title }) => item(number, `${number} · ${title}`)),
      },
      {
        title: 'Airfoils',
        items: [...new Set(design.airfoils.map((row) => row.airfoil))].map((name) =>
          item(name, name),
        ),
      },
    ];
  });
  /**
   * The diagnostics of the selected item, and those without a place. A form
   * shows the errors of its fields under them; the others are listed here.
   */
  protected readonly localDiagnostics = computed(() => {
    const selected = this.editor.selection();
    const form = !!this.sectionForm();
    return this.draft.diagnostics().filter((diagnostic) => {
      const place = placeOf(diagnostic);
      return (
        (place === undefined || place === selected) &&
        !(form && diagnostic.severity === 'error' && diagnostic.field)
      );
    });
  });

  /** The errors that block Save: text that is not a number first, then the design errors. */
  protected readonly blocking = computed(
    () => this.editor.unparsed().length + this.draft.errors().length,
  );

  constructor() {
    this.ref
      .keydownEvents()
      .pipe(
        filter((event) => event.key === 'Escape'),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        event.preventDefault();
        this.close();
      });
  }

  protected showFirstError(): void {
    const [first] = this.draft.errors();
    if (!this.editor.focusUnparsed() && first) this.showDiagnostic(first);
  }

  protected showDiagnostic(diagnostic: Diagnostic): void {
    const place = placeOf(diagnostic);
    if (place === undefined || !this.editor.select(place)) return;
    // A section without a form lists the error instead.
    const field = SECTION_FORMS.has(place) && diagnostic.field;
    const target = field && fieldAt(this.editor.form, field);
    if (target) afterNextRender(() => target().focusBoundControl(), { injector: this.injector });
  }

  protected textTarget(): string {
    const selected = this.editor.selection();
    return typeof selected === 'number' ? DESIGN_FILE : selected;
  }

  protected submit(): void {
    if (this.editor.form().invalid()) return;
    this.ref.close(this.draft.changed() ? { design: this.draft.project().design } : undefined);
  }

  /** Closes with `result`, after confirming that unsaved edits may be discarded. */
  protected close(result?: DesignEditorResult): void {
    if (!this.draft.changed()) {
      this.ref.close(result);
      return;
    }
    // A confirmation is already open above the editor.
    if (this.dialogs.openDialogs.length > 1) return;
    this.dialogs
      .open<DiscardChangesDialog, undefined, boolean>(DiscardChangesDialog)
      .afterClosed()
      .subscribe((discard) => {
        if (discard) this.ref.close(result);
      });
  }
}
