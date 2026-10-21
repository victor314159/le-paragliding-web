import { Component, inject } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { ThemeService } from '../shared/theme.service';

@Component({
  selector: 'header[app-masthead]',
  imports: [MatIcon, MatIconButton, MatTooltip],
  template: `
    <a class="brand mat-font-title-lg" href="./">
      <svg viewBox="0 0 42 30" width="42" height="30" aria-hidden="true">
        <path d="M2 13Q21-7 40 13M2 13Q21 4 40 13M2 13L21 28L40 13M12 10L21 28L30 10" />
      </svg>
      <span>LEparagliding <span class="edition">Web</span></span>
    </a>
    <div class="end">
      <span class="mat-font-label-lg mat-text-on-surface-variant">3.29 / Jardins</span>
      <button
        matIconButton
        type="button"
        data-testid="theme-toggle"
        [matTooltip]="label()"
        [attr.aria-label]="label()"
        (click)="theme.toggle()"
      >
        <mat-icon [svgIcon]="theme.scheme() === 'dark' ? 'light_mode' : 'dark_mode'" />
      </button>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 8px 16px;
      min-height: 96px;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 600;
      text-decoration: none;
      color: inherit;
    }
    .end {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .edition {
      font-weight: 400;
      color: var(--mat-sys-on-surface-variant);
    }
    svg {
      fill: none;
      stroke: var(--mat-sys-primary);
      stroke-width: 1.4;
    }
  `,
})
export class Masthead {
  protected readonly theme = inject(ThemeService);

  protected label(): string {
    return this.theme.scheme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  }
}
