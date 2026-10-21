import { Component, computed, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatFormField, MatHint } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

export interface FileEditorData {
  name: string;
  text: string;
}

/** Plain-text editor for one input file; closes with the new text, if changed. */
@Component({
  selector: 'app-file-editor-dialog',
  imports: [
    MatButton,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatFormField,
    MatHint,
    MatInput,
  ],
  template: `
    <h2 mat-dialog-title>Edit {{ data.name }}</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <textarea
          #editor
          matInput
          rows="22"
          spellcheck="false"
          wrap="off"
          [attr.aria-label]="'Content of ' + data.name"
          [value]="text()"
          [selectionStart]="0"
          [selectionEnd]="0"
          (input)="text.set(editor.value)"
        ></textarea>
        <mat-hint>{{ lines() }} lines · Plain text</mat-hint>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions>
      <!-- A bare mat-dialog-close attribute would close with '', an empty file. -->
      <button matButton type="button" [mat-dialog-close]="undefined">Cancel</button>
      <button matButton="filled" type="button" (click)="save()">Apply changes</button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-form-field {
      width: 100%;
      --mat-form-field-container-text-font: var(--app-font-mono);
      --mat-form-field-container-text-size: var(--mat-sys-body-small-size);
      --mat-form-field-container-text-line-height: 1.6;
    }
    textarea {
      max-height: 50dvh;
      resize: vertical;
    }
  `,
})
export class FileEditorDialog {
  protected readonly data = inject<FileEditorData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<FileEditorDialog, string>>(MatDialogRef);
  // A textarea normalizes line endings. Opening and applying without edits must
  // preserve the original bytes, including CRLF and any original encoding marker.
  private readonly initial = this.data.text.replace(/\r\n?/g, '\n');
  protected readonly text = signal(this.initial);
  protected readonly lines = computed(() => this.text().split('\n').length);

  protected save(): void {
    this.dialogRef.close(this.text() === this.initial ? undefined : this.text());
  }
}
