import { Component } from '@angular/core';
import { LINKS } from '../shared/links';

@Component({
  selector: 'footer[app-footer]',
  host: { class: 'mat-font-body-sm mat-text-on-surface-variant' },
  // External links open in a new tab: leaving the page would discard drafts.
  template: `
    <span>
      Based on
      <a [href]="links.leparagliding" target="_blank" rel="noopener">LEparagliding</a>
      by Pere Casellas ·
      <a [href]="links.laboratoriDenvol" target="_blank" rel="noopener">Laboratori d’envol</a>
    </span>
    <span>
      <a [href]="links.license" target="_blank" rel="noopener">GPL-3.0</a>
      ·
      <a [href]="links.repository" target="_blank" rel="noopener">Source code</a>
    </span>
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 4px 16px;
      padding: 32px 0;
    }
    a {
      color: inherit;
    }
    a:hover {
      color: var(--mat-sys-primary);
    }
  `,
})
export class Footer {
  protected readonly links = LINKS;
}
