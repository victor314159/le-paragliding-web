import { afterNextRender, Component, computed, inject, Injector, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormRoot } from '@angular/forms/signals';
import { MatButton, MatIconButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { DESIGN_FILE, type Diagnostic, type LepProject } from '@lepara/format';
import { filter } from 'rxjs';
import { diagnosticLabel, withSeverity } from '../shared/diagnostics';
import { Dxf2dSection } from './dxf2d-section';
import { Dxf3dSection } from './dxf3d-section';
import { EditorDraft, fieldAt } from './editor-draft';
import { hasForm, SECTIONS, type Selection } from './sections';
import { SewingSection } from './sewing-section';

const MANUAL = 'https://www.laboratoridenvol.com/leparagliding/manual.en.html';

export interface DesignEditorData {
  /** The project as read: it may have errors, which the editor shows. */
  readonly project: LepProject;
  /** The diagnostics of reading its files, from `readProject`. */
  readonly reading: readonly Diagnostic[];
}

export type DesignEditorResult = { project: LepProject } | { editText: string };

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

/** Edits the parameters of a project in a dialog; closes with the new project, if saved. */
@Component({
  selector: 'app-design-editor',
  imports: [FormRoot, MatButton, MatIconButton, MatIcon, SewingSection, Dxf2dSection, Dxf3dSection],
  templateUrl: './design-editor.html',
  styleUrl: './design-editor.css',
})
export class DesignEditor {
  private readonly data = inject<DesignEditorData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<DesignEditor, DesignEditorResult>>(MatDialogRef);
  private readonly dialogs = inject(MatDialog);
  private readonly injector = inject(Injector);
  protected readonly draft = new EditorDraft(this.data.project, this.data.reading);
  protected readonly designFile = DESIGN_FILE;
  protected readonly hasForm = hasForm;
  protected readonly diagnosticLabel = diagnosticLabel;
  protected readonly selection = signal<Selection>(6);
  protected readonly navOpen = signal(false);
  protected readonly colorsByLineType = computed(() => {
    const special = this.draft.project().design.specialParameters;
    return (
      special.mode === 1 &&
      special.entries.some((entry) => entry.code === 1341 && entry.value === 1)
    );
  });
  protected readonly title = computed(() => {
    const selected = this.selection();
    return typeof selected === 'number'
      ? `${selected} · ${SECTIONS.find((section) => section.number === selected)?.title ?? ''}`
      : selected;
  });
  protected readonly manualUrl = computed(() => `${MANUAL}#6.${this.selection()}`);
  /** The sections and airfoils, with their error counts: the way to every error. */
  protected readonly navigation = computed(() => {
    const counts = new Map<Selection | undefined, number>();
    for (const error of withSeverity(this.draft.diagnostics(), 'error')) {
      const place = placeOf(error);
      counts.set(place, (counts.get(place) ?? 0) + 1);
    }
    const item = (id: Selection, label: string, note: string): NavigationItem => {
      const errors = counts.get(id) ?? 0;
      const count = errors ? `${errors} ${errors === 1 ? 'error' : 'errors'}` : '';
      return { id, label, errors, note: [note, count].filter(Boolean).join(' · ') };
    };
    const { design } = this.draft.project();
    return [
      {
        title: 'Sections',
        items: SECTIONS.map(({ number, title }) =>
          item(number, `${number} · ${title}`, hasForm(number) ? '' : 'Text only'),
        ),
      },
      {
        title: 'Airfoils',
        items: [...new Set(design.airfoils.map((row) => row.airfoil))].map((name) =>
          item(name, name, 'Text only'),
        ),
      },
    ];
  });
  /**
   * The diagnostics of the selected item, and those without a place. A form
   * shows the errors of its fields under them; the others are listed here.
   */
  protected readonly localDiagnostics = computed(() => {
    const selected = this.selection();
    return this.draft.diagnostics().filter((diagnostic) => {
      const place = placeOf(diagnostic);
      return (
        (place === undefined || place === selected) &&
        !(hasForm(selected) && diagnostic.severity === 'error' && diagnostic.field)
      );
    });
  });

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

  protected select(value: Selection): void {
    this.selection.set(value);
    this.navOpen.set(false);
  }

  protected showDiagnostic(diagnostic: Diagnostic): void {
    const place = placeOf(diagnostic);
    if (place !== undefined) this.select(place);
    const field = diagnostic.field && fieldAt(this.draft.form, diagnostic.field);
    if (field) afterNextRender(() => field().focusBoundControl(), { injector: this.injector });
  }

  protected textTarget(): string {
    const selected = this.selection();
    return typeof selected === 'number' ? DESIGN_FILE : selected;
  }

  protected submit(): void {
    if (!this.draft.form().invalid()) this.ref.close({ project: this.draft.project() });
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
