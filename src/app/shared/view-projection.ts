import { Component, inject, Injectable, signal } from '@angular/core';

/** How the 3D views show a model: in perspective, or orthographic, to scale. */
@Injectable({ providedIn: 'root' })
export class ViewProjection {
  readonly perspective = signal(false);
}

/** The choice of the projection of every 3D view. */
@Component({
  selector: 'app-projection-select',
  template: `
    <select
      aria-label="Projection"
      (change)="projection.perspective.set($any($event.target).value === 'perspective')"
    >
      <option value="orthographic" [selected]="!projection.perspective()">Orthographic</option>
      <option value="perspective" [selected]="projection.perspective()">Perspective</option>
    </select>
  `,
  styles: `
    select {
      cursor: pointer;
      max-width: 100%;
      padding: 6px;
      border: 1px solid var(--mat-sys-outline);
      border-radius: 4px;
      color: var(--mat-sys-on-surface);
      background: var(--mat-sys-surface);
      font: var(--mat-sys-body-medium);
    }
  `,
})
export class ProjectionSelect {
  protected readonly projection = inject(ViewProjection);
}
