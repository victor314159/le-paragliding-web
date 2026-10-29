import { Component } from '@angular/core';

@Component({
  selector: 'app-intro',
  template: `
    <h1 class="mat-font-headline-sm">Design paraglider wings in your browser.</h1>
    <p class="mat-font-body-md mat-text-on-surface-variant">
      Generate wing geometry, cutting patterns and line plans. All calculations run locally in your
      browser.
    </p>
  `,
  styles: `
    :host {
      display: block;
      padding: 8px 0 12px;
    }
    p {
      margin: 0;
    }
    h1 {
      margin: 0 0 4px;
    }
  `,
})
export class Intro {}
