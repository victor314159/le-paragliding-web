import { Component, inject } from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatOption, MatSelect } from '@angular/material/select';
import { ColorsByLineType } from './colors-by-line-type';
import { EditorState } from './editor-state';
import { LineColors } from './line-colors';
import { NumberField } from './number-field';

@Component({
  selector: 'app-dxf3d-section',
  imports: [
    ColorsByLineType,
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
    <app-colors-by-line-type />
    <mat-form-field appearance="outline" subscriptSizing="dynamic">
      <mat-label>3D DXF mode</mat-label>
      <mat-select [formField]="form.mode">
        <mat-option [value]="0">0 · Engine defaults</mat-option>
        <mat-option [value]="1">1 · Custom colors and surfaces</mat-option>
      </mat-select>
      <mat-hint
        >Mode 0 uses the engine's colors; mode 1 also controls the unifilar surfaces.</mat-hint
      >
    </mat-form-field>
    @if (form.mode().value() === 1) {
      <app-line-colors [form]="form.lineColors" />
      @for (name of names; track name; let index = $index) {
        <fieldset>
          <legend>{{ name }}</legend>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ name }} surface</mat-label>
            <mat-select [formField]="form.surfaces[index].drawn">
              <mat-option [value]="0">0 · Hidden</mat-option>
              <mat-option [value]="1">1 · Drawn</mat-option>
            </mat-select>
          </mat-form-field>
          <app-number-field
            [label]="name + ' color'"
            [hint]="'DXF color index for the unifilar ' + name.toLowerCase() + ' surface.'"
            integer
            [field]="form.surfaces[index].color"
          />
        </fieldset>
      }
    }
  `,
  styleUrl: './section.css',
})
export class Dxf3dSection {
  protected readonly form = inject(EditorState).form.dxf3d;
  protected readonly names = ['Extrados', 'Vents', 'Intrados'];
}
