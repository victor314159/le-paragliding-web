import { computed, inject, Injectable, signal, type WritableSignal } from '@angular/core';
import { form, validateTree, type FieldTree, type ReadonlyFieldTree } from '@angular/forms/signals';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import type { Diagnostic, LepDesign, LepProject } from '@lepara/format';
import { EditorDraft, type EditorForm } from './editor-draft';

export interface DesignEditorData {
  /** The project as read: it may have errors, which the editor shows. */
  readonly project: LepProject;
  /** The diagnostics of reading its files, from `readProject`. */
  readonly reading: readonly Diagnostic[];
}

/** The new design, if saved and changed; or the file to edit as text. */
export type DesignEditorResult = { design: LepDesign } | { editText: string };

/** A section number, or an airfoil's file name. */
export type Selection = number | string;

/** The keys of a model path such as `dxf3d.surfaces[0].color`. */
const pathKeys = (path: string) => path.split(/[.[\]]+/).filter(Boolean);

/** The field at a model path such as `dxf3d.surfaces[0].color`, if the form has it. */
export function fieldAt(
  tree: ReadonlyFieldTree<unknown>,
  path: string,
): ReadonlyFieldTree<unknown> | undefined {
  let field: unknown = tree;
  for (const key of pathKeys(path)) {
    field = (field as Record<string, unknown> | undefined)?.[key];
  }
  return field as ReadonlyFieldTree<unknown> | undefined;
}

/** The form of a draft, with its design errors on their fields. Call in an injection context. */
function draftForm(draft: EditorDraft): EditorForm {
  return form(draft.value, (path) => {
    validateTree(path, ({ fieldTree }) =>
      draft.errors().map(({ field, message }) => ({
        kind: 'format',
        message,
        fieldTree: (field && fieldAt(fieldTree, field)) || fieldTree,
      })),
    );
  });
}

/** The state of an open editor, shared by its sections: the draft, its form and the selected item. */
@Injectable()
export class EditorState {
  private readonly data = inject<DesignEditorData>(MAT_DIALOG_DATA);
  readonly draft = new EditorDraft(this.data.project, this.data.reading);
  readonly form = draftForm(this.draft);
  readonly selection = signal<Selection>(1);
  /** The navigation is open, on narrow screens. */
  readonly navOpen = signal(false);
  readonly previewCollapsed = signal(false);
  /** The height set by dragging the preview divider; null for the default. */
  readonly previewHeight = signal<number | null>(null);
  /** Incremented to fit the preview drawing to its viewport. */
  readonly previewFitRequest = signal(0);
  /** The preview view chosen in each section, by section number. */
  readonly previewViews = signal<Readonly<Record<number, string>>>({ 2: 'profile', 4: 'profile' });
  /** The rib chosen in each section's preview, by section number. */
  readonly previewRibs = signal<Readonly<Record<number, number>>>({});
  /** The surface of the shaping cut last focused, in section 29. */
  readonly shapingSurface = signal<'upper' | 'lower'>('upper');
  private readonly recordSelections = new WeakMap<object, WritableSignal<number>>();

  setPreviewView(section: number, view: string): void {
    this.previewViews.update((views) => ({ ...views, [section]: view }));
  }

  setPreviewRib(section: number, rib: number): void {
    this.previewRibs.update((ribs) => ({ ...ribs, [section]: rib }));
  }

  private recordSelection(rows: object): WritableSignal<number> {
    let selection = this.recordSelections.get(rows);
    if (!selection) {
      selection = signal(0);
      this.recordSelections.set(rows, selection);
    }
    return selection;
  }

  /** The selected row of a collection: shown by its record editor, highlighted in its table. */
  selectedRecord(rows: FieldTree<readonly unknown[]>): number {
    return Math.max(0, Math.min(rows.length - 1, this.recordSelection(rows)()));
  }

  selectRecord(rows: FieldTree<readonly unknown[]>, index: number): void {
    this.recordSelection(rows).set(index);
  }

  /** Selects the rows on the path of a diagnostic's field, before focusing it. */
  revealField(path: string): void {
    let node: unknown = this.form;
    for (const key of pathKeys(path)) {
      if (/^\d+$/.test(key) && node) this.recordSelection(node).set(Number(key));
      node = (node as Record<string, unknown> | undefined)?.[key];
    }
  }

  /**
   * The errors of text that is not a number, in the shown section: only its
   * controls hold that text, and the model keeps the last number.
   */
  readonly unparsed = computed(() =>
    this.form()
      .errorSummary()
      .filter((error) => error.kind === 'parse'),
  );

  /** Structural edits must not discard text still held by a number control. */
  append<T>(field: FieldTree<readonly T[]>, value: T): void {
    if (this.focusUnparsed()) return;
    field().value.update((rows) => [...rows, structuredClone(value)]);
    this.selectRecord(field, field().value().length - 1);
  }

  remove<T>(field: FieldTree<readonly T[]>, index: number): void {
    if (this.focusUnparsed()) return;
    field().value.update((rows) => rows.filter((_, i) => i !== index));
  }

  /**
   * Shows `selection`, unless the shown section has text that is not a
   * number: leaving would discard it, so its first field is focused instead.
   */
  select(selection: Selection): boolean {
    this.navOpen.set(false);
    if (selection !== this.selection() && this.focusUnparsed()) return false;
    this.selection.set(selection);
    return true;
  }

  /** Focuses the first field with text that is not a number, if any. */
  focusUnparsed(): boolean {
    const field = this.unparsed()[0]?.fieldTree();
    field?.focusBoundControl();
    return !!field;
  }
}
