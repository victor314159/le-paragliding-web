import { Component, input } from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatOption, MatSelect } from '@angular/material/select';
import type { Dxf3dForm } from './editor-draft';
import { LineColors } from './line-colors';
import { NumberField } from './number-field';

@Component({
  selector: 'app-dxf3d-section',
  imports: [
    FormField,
    MatFormField,
    MatHint,
    MatLabel,
    MatOption,
    MatSelect,
    LineColors,
    NumberField,
  ],
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic">
      <mat-label>3D DXF mode</mat-label>
      <mat-select [formField]="form().mode">
        <mat-option value="0">0 · Engine defaults</mat-option>
        <mat-option value="1">1 · Custom colors and surfaces</mat-option>
      </mat-select>
      <mat-hint
        >Mode 0 uses the engine's colors; mode 1 also controls the unifilar surfaces.</mat-hint
      >
    </mat-form-field>
    @if (form().mode().value() === '1') {
      <app-line-colors [form]="form().lineColors" />
      @for (name of names; track name; let index = $index) {
        <fieldset>
          <legend>{{ name }}</legend>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ name }} surface</mat-label>
            <mat-select [formField]="form().surfaces[index].drawn">
              <mat-option value="0">0 · Hidden</mat-option>
              <mat-option value="1">1 · Drawn</mat-option>
            </mat-select>
          </mat-form-field>
          <app-number-field
            [label]="name + ' color'"
            [hint]="
              'DXF color index for the unifilar ' + name.toLowerCase() + ' surface (integer).'
            "
            [field]="form().surfaces[index].color"
          />
        </fieldset>
      }
    }
  `,
  styleUrl: './section.css',
})
export class Dxf3dSection {
  readonly form = input.required<Dxf3dForm>();
  protected readonly names = ['Extrados', 'Vents', 'Intrados'];
}
