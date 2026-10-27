import { Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
  type MatDialog,
} from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { map, type Observable } from 'rxjs';

export interface ConfirmDialogData {
  readonly title: string;
  readonly message: string;
  /** An icon before the title, such as `warning`. */
  readonly icon?: string;
  readonly cancel: string;
  readonly confirm: string;
}

/** Asks before an action that discards or replaces something, or that needs a warning. */
@Component({
  selector: 'app-confirm-dialog',
  imports: [MatButton, MatIcon, MatDialogTitle, MatDialogContent, MatDialogActions, MatDialogClose],
  template: `
    <h2 mat-dialog-title>
      @if (data.icon) {
        <mat-icon [svgIcon]="data.icon" />
      }
      {{ data.title }}
    </h2>
    <mat-dialog-content>{{ data.message }}</mat-dialog-content>
    <mat-dialog-actions>
      <button matButton type="button" [mat-dialog-close]="false">{{ data.cancel }}</button>
      <button matButton="filled" type="button" [mat-dialog-close]="true">
        {{ data.confirm }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    h2 {
      display: flex;
      align-items: center;
      gap: 8px;
    }
  `,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}

/** Emits once: true if confirmed. */
export function confirm(dialogs: MatDialog, data: ConfirmDialogData): Observable<boolean> {
  return dialogs
    .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, { data, maxWidth: '480px' })
    .afterClosed()
    .pipe(map((confirmed) => !!confirmed));
}
