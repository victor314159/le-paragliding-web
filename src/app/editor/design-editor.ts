import { NgComponentOutlet } from '@angular/common';
import {
  afterNextRender,
  afterRenderEffect,
  Component,
  computed,
  effect,
  type ElementRef,
  inject,
  Injector,
  untracked,
  viewChild,
} from '@angular/core';
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
import { AirfoilSection } from './airfoil-section';
import { EditorPreview, PREVIEW_VIEWS } from './editor-preview';
import { EditorState, fieldAt, type DesignEditorResult, type Selection } from './editor-state';
import { SECTION_FORMS } from './sections';

const MANUAL = 'https://www.laboratoridenvol.com/leparagliding/manual.en.html';

/** Where the editor shows a diagnostic: its section or its airfoil; on every page otherwise. */
function placeOf({ section, file, field }: Diagnostic): Selection | undefined {
  // A constraint can come from another section: XFLR5, for example, reports
  // errors on geometry.wingName and geometry.ribs[].xp, whose inputs are in 1.
  const key = field?.split(/[.[]/, 1)[0];
  const controlSection = SECTIONS.find((item) => item.key === key)?.number;
  return controlSection ?? section ?? (file && file !== DESIGN_FILE ? file : undefined);
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
  imports: [FormRoot, MatButton, MatIconButton, MatIcon, NgComponentOutlet, EditorPreview],
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
  protected readonly sectionForm = computed(() =>
    this.editor.airfoil() ? AirfoilSection : SECTION_FORMS.get(this.editor.selection()),
  );
  protected readonly section = computed(() => {
    const selected = this.editor.selection();
    return typeof selected === 'number' ? selected : undefined;
  });
  protected readonly title = computed(() => {
    const selected = this.editor.selection();
    return typeof selected === 'number'
      ? `${selected} · ${SECTIONS.find((section) => section.number === selected)?.title ?? ''}`
      : selected;
  });
  /** The selected airfoil has a file, with reading errors. */
  protected readonly unreadable = computed(() => {
    const selected = this.editor.selection();
    return this.draft.diagnostics().some(({ file }) => file === selected);
  });
  protected readonly manualUrl = computed(() => `${MANUAL}#6.${this.editor.selection()}`);
  protected readonly hasPreview = computed(
    () => !!this.editor.airfoil() || PREVIEW_VIEWS.has(Number(this.editor.selection())),
  );
  /** The sections and airfoils, with their error counts: the way to every error. */
  protected readonly navigation = computed(() => {
    const counts = new Map<Selection | undefined, number>();
    for (const error of withSeverity(this.draft.diagnostics(), 'error')) {
      const place = placeOf(error);
      counts.set(place, (counts.get(place) ?? 0) + 1);
    }
    const airfoils = this.draft.airfoilValue();
    const changed = this.draft.changedAirfoils();
    const item = (id: Selection, label: string): NavigationItem => {
      const errors = counts.get(id) ?? 0;
      const note =
        typeof id === 'number'
          ? SECTION_FORMS.has(id)
            ? ''
            : 'Text only'
          : !Object.hasOwn(airfoils, id)
            ? 'Not read'
            : changed.has(id)
              ? 'Modified'
              : '';
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
   * shows the errors of its fields under them; the others are listed under the title.
   */
  protected readonly localDiagnostics = computed(() => {
    const selected = this.editor.selection();
    return this.draft.diagnostics().filter((diagnostic) => {
      const place = placeOf(diagnostic);
      if (place !== undefined && place !== selected) return false;
      return !this.inputOf(diagnostic);
    });
  });

  /** The errors that block Save: text that is not a number first, then the design errors. */
  protected readonly blocking = computed(
    () =>
      this.editor.unparsed().length +
      this.draft.errors().length +
      this.draft.airfoilErrors().length,
  );
  /** The files that saving rewrites. */
  protected readonly rewritten = computed(() => [
    ...(this.draft.designChanged() ? [DESIGN_FILE] : []),
    ...this.draft.changedAirfoils().keys(),
  ]);

  private readonly content = viewChild<ElementRef<HTMLElement>>('content');
  private readonly navigationList = viewChild<ElementRef<HTMLElement>>('nav');
  private readonly diagnostics = viewChild<ElementRef<HTMLElement>>('diagnostics');

  constructor() {
    // Each section opens at its top, not at the scroll position of the previous one.
    effect(() => {
      this.editor.selection();
      untracked(() => this.content()?.nativeElement.scrollTo(0, 0));
    });
    // The selected item stays in sight: an airfoil opened from its file is at the end.
    afterRenderEffect({
      read: () => {
        this.editor.selection();
        this.navigationList()
          ?.nativeElement.querySelector('[aria-current="true"]')
          ?.scrollIntoView({ block: 'nearest' });
      },
    });
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
    const [first] = [...this.draft.errors(), ...this.draft.airfoilErrors()];
    if (!this.editor.focusUnparsed() && first) this.showDiagnostic(first);
  }

  protected showDiagnostic(diagnostic: Diagnostic): void {
    const place = placeOf(diagnostic);
    if (place === undefined || !this.editor.select(place)) return;
    if (diagnostic.field) this.editor.revealField(diagnostic.field, this.editor.formOf(place));
    // An error without an input of its own is in the list under the title.
    const target = this.inputOf(diagnostic, place);
    afterNextRender(
      () => (target ? target().focusBoundControl() : this.diagnostics()?.nativeElement.focus()),
      { injector: this.injector },
    );
  }

  /** The input that shows an error under it, in the form of its section or airfoil. */
  private inputOf(diagnostic: Diagnostic, place = placeOf(diagnostic)) {
    const tree = place === undefined ? undefined : this.editor.formOf(place);
    if (!tree || (typeof place === 'number' && !SECTION_FORMS.has(place))) return undefined;
    if (diagnostic.severity !== 'error' || !diagnostic.field) return undefined;
    const field = fieldAt(tree, diagnostic.field);
    const value = field?.().value();
    // Row counts and cross-field errors belong to a collection or an object,
    // without an individual input to display them underneath.
    return value !== null && typeof value === 'object' ? undefined : field;
  }

  protected textTarget(): string {
    const selected = this.editor.selection();
    return typeof selected === 'number' ? DESIGN_FILE : selected;
  }

  protected submit(): void {
    if (this.blocking()) return;
    if (!this.draft.changed()) {
      this.ref.close();
      return;
    }
    this.ref.close({
      ...(this.draft.designChanged() && { design: this.draft.project().design }),
      airfoils: this.draft.changedAirfoils(),
    });
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
