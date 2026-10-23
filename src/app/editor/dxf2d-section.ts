import { Component, inject } from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatOption, MatSelect } from '@angular/material/select';
import { ColorsByLineType } from './colors-by-line-type';
import { EditorState } from './editor-state';
import { LineColors } from './line-colors';

@Component({
  selector: 'app-dxf2d-section',
  imports: [
    ColorsByLineType,
    FormField,
    MatFormField,
    MatHint,
    MatLabel,
    MatOption,
    MatSelect,
    LineColors,
  ],
  template: `
    <app-colors-by-line-type />
    <mat-form-field appearance="outline" subscriptSizing="dynamic">
      <mat-label>2D DXF mode</mat-label>
      <mat-select [formField]="form.mode">
        <mat-option [value]="0">0 · Engine defaults</mat-option>
        <mat-option [value]="1">1 · Custom colors</mat-option>
      </mat-select>
      <mat-hint>Mode 0 uses the engine's colors; mode 1 sets the A–F line colors.</mat-hint>
    </mat-form-field>
    @if (form.mode().value() === 1) {
      <app-line-colors [form]="form.lineColors" />
    }
  `,
  styleUrl: './section.css',
})
export class Dxf2dSection {
  protected readonly form = inject(EditorState).form.dxf2d;
}
