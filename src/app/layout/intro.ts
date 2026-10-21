import { Component } from '@angular/core';

@Component({
  selector: 'app-intro',
  template: `
    <p class="mat-font-label-lg mat-text-primary">Design workspace</p>
    <h1 class="mat-font-display-md">Design paraglider wings in your browser.</h1>
    <p class="mat-font-body-lg mat-text-on-surface-variant">
      Generate wing geometry, cutting patterns and line plans.<br />
      All calculations run locally in your browser.
    </p>
  `,
  styles: `
    :host {
      display: block;
      padding: 48px 0 32px;
    }
    p {
      margin: 0;
    }
    p:first-child {
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    h1 {
      margin: 12px 0 16px;
    }
    @media (max-width: 480px) {
      :host {
        padding-top: 32px;
      }
      h1 {
        font: var(--mat-sys-display-small);
      }
    }
  `,
})
export class Intro {}
