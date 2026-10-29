import { Component } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';
import { LINKS } from '../shared/links';

/** Full warning, reviewed without changing the workspace layout. */
@Component({
  selector: 'app-safety-disclaimer-dialog',
  imports: [MatButton, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle],
  template: `
    <h2 mat-dialog-title>Safety disclaimer</h2>
    <mat-dialog-content>
      <p>
        This application is an experimental browser port of LEparagliding. Errors may arise from the
        original software, the port, or the input data.
      </p>
      <p>
        The results do not constitute a safety assessment or airworthiness certification. They must
        not be used as the sole basis for building or flying a wing. Any real-world use requires
        independent verification and appropriate testing by qualified individuals.
      </p>
      <p>
        Paragliding is inherently dangerous. Designing, building, testing or flying a wing, even one
        built from correct results, can cause property damage, serious injury or death. You do so at
        your own risk.
      </p>
      <p>
        The software is provided without warranty, to the extent permitted by applicable law. See
        the
        <a [href]="links.license" target="_blank" rel="noopener">GNU GPL v3 license</a>.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions>
      <button matButton type="button" mat-dialog-close>Close</button>
    </mat-dialog-actions>
  `,
})
export class SafetyDisclaimerDialog {
  protected readonly links = LINKS;
}
