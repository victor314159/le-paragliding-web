import { computed, inject, Injectable, signal } from '@angular/core';
import { form, validateTree, type ReadonlyFieldTree } from '@angular/forms/signals';
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

/** The field at a model path such as `dxf3d.surfaces[0].color`, if the form has it. */
export function fieldAt(
  tree: ReadonlyFieldTree<unknown>,
  path: string,
): ReadonlyFieldTree<unknown> | undefined {
  let field: unknown = tree;
  for (const key of path.split(/[.[\]]+/).filter(Boolean)) {
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
  readonly selection = signal<Selection>(6);
  /** The navigation is open, on narrow screens. */
  readonly navOpen = signal(false);
  /**
   * The errors of text that is not a number, in the shown section: only its
   * controls hold that text, and the model keeps the last number.
   */
  readonly unparsed = computed(() =>
    this.form()
      .errorSummary()
      .filter((error) => error.kind === 'parse'),
  );

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
