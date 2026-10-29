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
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormRoot } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltip } from '@angular/material/tooltip';
import { DESIGN_FILE, SECTIONS, type Diagnostic } from '@lepara/format';
import { PRE_DATA_FILE } from '@lepara/preprocessor';
import { filter } from 'rxjs';
import { confirm } from '../shared/confirm-dialog';
import { diagnosticLabel, withSeverity } from '../shared/diagnostics';
import { PRE_DATA_NOTE_TEXT } from '../shared/pre-data-note';
import { AirfoilSection } from './airfoil-section';
import { EditorPreview, PREVIEW_VIEWS } from './editor-preview';
import {
  EditorState,
  fieldAt,
  type DesignEditorResult,
  type PreprocessorStatus,
  type Selection,
} from './editor-state';
import { SECTION_FORMS } from './sections';
import { WingOverview } from './wing-overview';

const MANUAL = 'https://www.laboratoridenvol.com/leparagliding/manual.en.html';
const PREPROCESSOR_MANUAL = 'https://www.laboratoridenvol.com/leparagliding/pre.en.html';
const PREPROCESSOR_NOTES: Readonly<Record<PreprocessorStatus, string>> = {
  invalid: 'Invalid parameters',
  synced: 'In sync',
  differs: 'Out of sync',
};

/** Where the editor shows a diagnostic: its section or its file; on every page otherwise. */
function placeOf({ section, file, field }: Diagnostic): Selection | undefined {
  // Its fields are those of the preprocessor, not of the design.
  if (file === PRE_DATA_FILE) return file;
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

/** Edits the parameters of a project in a dialog; closes with the new design, if saved. */
@Component({
  selector: 'app-design-editor',
  imports: [
    FormRoot,
    MatButton,
    MatIcon,
    MatMenu,
    MatMenuItem,
    MatMenuTrigger,
    MatTooltip,
    NgComponentOutlet,
    EditorPreview,
    WingOverview,
  ],
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
  protected readonly preDataFile = PRE_DATA_FILE;
  protected readonly preDataNote = PRE_DATA_NOTE_TEXT;
  protected readonly diagnosticLabel = diagnosticLabel;
  protected readonly sectionForm = computed(() =>
    this.editor.airfoil()
      ? AirfoilSection
      : this.unreadable()
        ? undefined
        : SECTION_FORMS.get(this.editor.selection()),
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
  /** The selected file exists, with reading errors. */
  protected readonly unreadable = computed(() => {
    const selected = this.editor.selection();
    return selected === PRE_DATA_FILE
      ? this.editor.preprocessor.unreadable
      : this.draft.diagnostics().some(({ file }) => file === selected);
  });
  protected readonly manual = computed(() => {
    const selected = this.editor.selection();
    if (selected === PRE_DATA_FILE)
      return { href: PREPROCESSOR_MANUAL, label: 'Preprocessor manual' };
    return typeof selected === 'number' && this.sectionForm()
      ? { href: `${MANUAL}#6.${selected}`, label: `LEparagliding manual · Section ${selected}` }
      : undefined;
  });
  /** The preprocessor's preview shows the geometry its parameters generate, once read or created. */
  protected readonly hasPreview = computed(() => {
    const selected = this.editor.selection();
    return (
      !!this.editor.airfoil() ||
      (PREVIEW_VIEWS.has(selected) &&
        (selected !== PRE_DATA_FILE || this.editor.preprocessor.loaded()))
    );
  });
  /** The sections and files, with their error counts: the way to every error. */
  protected readonly navigation = computed(() => {
    const counts = new Map<Selection | undefined, number>();
    for (const error of withSeverity(this.editor.diagnostics(), 'error')) {
      const place = placeOf(error);
      counts.set(place, (counts.get(place) ?? 0) + 1);
    }
    const item = (id: Selection, label: string): NavigationItem => {
      const errors = counts.get(id) ?? 0;
      const note = this.noteOf(id);
      const count = errors ? `${errors} ${errors === 1 ? 'error' : 'errors'}` : '';
      return { id, label, errors, note: [note, count].filter(Boolean).join(' · ') };
    };
    const { design } = this.draft.project();
    // Before the sections: it generates the rib table of section 1.
    return [
      { title: 'Preprocessor', items: [item(PRE_DATA_FILE, PRE_DATA_FILE)] },
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
    return this.editor.diagnostics().filter((diagnostic) => {
      const place = placeOf(diagnostic);
      if (place !== undefined && place !== selected) return false;
      return !this.inputOf(diagnostic);
    });
  });

  /** The errors that block Save: text that is not a number first, then the design errors. */
  protected readonly blocking = computed(
    () => this.editor.unparsed().length + this.editor.errors().length,
  );
  /** The files that saving rewrites. */
  protected readonly rewritten = computed(() => [
    ...(this.draft.designChanged() ? [DESIGN_FILE] : []),
    ...this.draft.changedAirfoils().keys(),
    ...(this.editor.preData() ? [PRE_DATA_FILE] : []),
  ]);

  private readonly content = viewChild<ElementRef<HTMLElement>>('content');
  private readonly navigationList = viewChild<ElementRef<HTMLElement>>('nav');
  private readonly diagnostics = viewChild<ElementRef<HTMLElement>>('diagnostics');
  private readonly viewMenu = viewChild(MatMenuTrigger);

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
        filter((event) => event.key === 'Escape' && !this.viewMenu()?.menuOpen),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        event.preventDefault();
        this.close();
      });
  }

  /** The state of a navigation item: a section without form, or a file not read or modified. */
  private noteOf(id: Selection): string {
    if (id === PRE_DATA_FILE) return this.preprocessorNote();
    if (typeof id === 'number') return SECTION_FORMS.has(id) ? '' : 'Text only';
    if (!Object.hasOwn(this.draft.airfoilValue(), id)) return 'Not read';
    return this.draft.changedAirfoils().has(id) ? 'Modified' : '';
  }

  /** Whether pre-data.txt generates the rib table of section 1, and is created or modified. */
  private preprocessorNote(): string {
    const { preprocessor } = this.editor;
    if (preprocessor.unreadable) return 'Not read';
    if (!preprocessor.loaded()) return 'Not created';
    const status = PREPROCESSOR_NOTES[this.editor.preprocessorStatus()];
    if (!preprocessor.changed()) return status;
    return `${status} · ${preprocessor.exists ? 'Modified' : 'Created'}`;
  }

  protected readonly overviewVisited = signal(this.editor.overviewOpen());

  protected setOverview(open: boolean): void {
    if (open === this.editor.overviewOpen() || this.editor.focusUnparsed()) return;
    this.overviewVisited.set(true);
    this.editor.navOpen.set(false);
    this.editor.overviewOpen.set(open);
  }

  protected showFirstError(): void {
    const [first] = this.editor.errors();
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
    if (!this.editor.changed()) {
      this.ref.close();
      return;
    }
    const preData = this.editor.preData();
    this.ref.close({
      ...(this.draft.designChanged() && { design: this.draft.project().design }),
      airfoils: this.draft.changedAirfoils(),
      ...(preData && { preData }),
    });
  }

  /** Closes with `result`, after confirming that unsaved edits may be discarded. */
  protected close(result?: DesignEditorResult): void {
    if (!this.editor.changed()) {
      this.ref.close(result);
      return;
    }
    // A confirmation is already open above the editor.
    if (this.dialogs.openDialogs.length > 1) return;
    confirm(this.dialogs, {
      title: 'Discard changes?',
      message: 'Your parameter edits have not been saved.',
      cancel: 'Keep editing',
      confirm: 'Discard changes',
    }).subscribe((discard) => {
      if (discard) this.ref.close(result);
    });
  }
}
