import type { MatDialogConfig } from '@angular/material/dialog';

/** Options of a dialog that covers the whole page. */
export const FULL_PAGE_DIALOG = {
  width: '100vw',
  height: '100dvh',
  maxWidth: '100vw',
  panelClass: 'full-page-dialog',
} satisfies MatDialogConfig;
