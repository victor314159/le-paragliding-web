import { Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { PRE_DATA_FILE } from '@lepara/preprocessor';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';
import { AddRow, RecordRow, RemoveRow } from './record-editor';
import { SelectField } from './select-field';
import { TableScroll } from './table-scroll';
import { TextField } from './text-field';

@Component({
  selector: 'app-geometry-section',
  imports: [
    AddRow,
    MatButton,
    NumberField,
    RecordRow,
    RemoveRow,
    SelectField,
    TableScroll,
    TextField,
  ],
  template: `
    @if (editor.preprocessor.loaded()) {
      <p>
        @switch (editor.preprocessorStatus()) {
          @case ('synced') {
            The cells and rib positions are those the parameters of pre-data.txt generate.
          }
          @case ('differs') {
            The cells and rib positions differ from those the parameters of pre-data.txt generate.
          }
          @default {
            The parameters of pre-data.txt are invalid.
          }
        }
        <button matButton type="button" (click)="editor.select(preDataFile)">
          Edit pre-data.txt
        </button>
      </p>
    }
    <fieldset>
      <legend>Wing</legend>
      <app-text-field label="Brand name" hint="Up to 50 UTF-8 bytes." [field]="form.brandName" />
      <app-text-field
        label="Wing name"
        hint="Also names the XFLR5 export file."
        [field]="form.wingName"
      />
      <app-number-field
        label="Drawing scale"
        hint="Scale of the 2D plans; usually 1."
        [field]="form.drawingScale"
      />
      <app-number-field
        label="Wing scale"
        hint="Scale applied to wing lengths; usually 1."
        [field]="form.wingScale"
      />
      <app-number-field
        label="Cells"
        hint="The half wing needs int(cells / 2) + 1 rows in sections 1–3."
        integer
        [field]="form.cells"
      />
      <app-number-field
        label="Rib count"
        hint="Usually cells + 1."
        integer
        [field]="form.ribCount"
      />
      <app-select-field
        label="Paraglider type"
        [field]="form.paragliderType"
        [options]="[
          ['ds', 'Double skin'],
          ['ss', 'Single skin'],
          ['pc', 'Parachute'],
          ['sk', 'sk'],
        ]"
      />
      <app-select-field
        label="Leading edge triangles"
        hint="Used for single-skin wings."
        [field]="form.paragliderParameter"
        [options]="[
          [0, 'Rotate'],
          [1, 'Keep orientation'],
        ]"
      />
    </fieldset>
    <fieldset>
      <legend>Washin</legend>
      <app-select-field
        label="Washin mode"
        [field]="form.washin.mode"
        [options]="[
          [0, 'Manual per rib'],
          [1, 'Automatic from zero at center'],
          [2, 'Automatic from center to tip'],
        ]"
      />
      <app-number-field label="Tip washin" unit="deg" [field]="form.washin.maxAngle" />
      @if (form.washin.mode().value() === 2) {
        <app-number-field label="Center washin" unit="deg" [field]="form.washin.centerAngle" />
      }
    </fieldset>
    <div class="section-controls">
      <app-select-field
        label="Rib table columns"
        [field]="form.ribColumns"
        [options]="[
          [9, 'Without vertical-axis rotation'],
          [11, 'With vertical-axis rotation'],
        ]"
      />
    </div>
    <div appTableScroll role="region" aria-label="Rib geometry">
      <table class="parameter-table">
        <caption>
          Rib geometry
        </caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Rib number</th>
            <th scope="col">Planform X (cm)</th>
            <th scope="col">Leading edge Y (cm)</th>
            <th scope="col">Trailing edge Y (cm)</th>
            <th scope="col">Final X′ (cm)</th>
            <th scope="col">Final Z (cm)</th>
            <th scope="col">Rib inclination (deg)</th>
            <th scope="col">Washin rotation point (% chord)</th>
            <th scope="col">Manual washin (deg)</th>
            @if (form.ribColumns().value() === 11) {
              <th scope="col">Vertical-axis rotation (deg)</th>
              <th scope="col">Vertical-axis position (% chord)</th>
            }
            <th scope="col" class="row-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          @for (rib of form.ribs; track rib; let i = $index) {
            <tr [appRecordRow]="form.ribs" [index]="i">
              <th scope="row">{{ i + 1 }}</th>
              <td><app-number-field compact label="Rib number" [field]="rib.number" /></td>
              <td>
                <app-number-field compact label="Planform X" unit="cm" [field]="rib.x" />
              </td>
              <td>
                <app-number-field compact label="Leading edge Y" unit="cm" [field]="rib.yLE" />
              </td>
              <td>
                <app-number-field compact label="Trailing edge Y" unit="cm" [field]="rib.yTE" />
              </td>
              <td>
                <app-number-field compact label="Final X′" unit="cm" [field]="rib.xp" />
              </td>
              <td>
                <app-number-field compact label="Final Z" unit="cm" [field]="rib.z" />
              </td>
              <td>
                <app-number-field compact label="Rib inclination" unit="deg" [field]="rib.beta" />
              </td>
              <td>
                <app-number-field
                  compact
                  label="Washin rotation point"
                  unit="% chord"
                  [field]="rib.rotationPoint"
                />
              </td>
              <td>
                <app-number-field compact label="Manual washin" unit="deg" [field]="rib.washin" />
              </td>
              @if (form.ribColumns().value() === 11) {
                <td>
                  <app-number-field
                    compact
                    label="Vertical-axis rotation"
                    unit="deg"
                    [field]="rib.rotZ"
                  />
                </td>
                <td>
                  <app-number-field
                    compact
                    label="Vertical-axis position"
                    unit="% chord"
                    [field]="rib.rotZPosition"
                  />
                </td>
              }
              <td class="row-actions">
                <app-remove-row [rows]="form.ribs" [index]="i" label="rib" />
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
    <app-add-row
      label="rib"
      [rows]="form.ribs"
      [max]="100"
      [row]="{
        number: form.ribs.length + 1,
        x: 0,
        yLE: 0,
        yTE: 1,
        xp: 0,
        z: 0,
        beta: 0,
        rotationPoint: 0,
        washin: 0,
        rotZ: 0,
        rotZPosition: 0,
      }"
    />
  `,
  styleUrl: './section.css',
})
export class GeometrySection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.geometry;
  protected readonly preDataFile = PRE_DATA_FILE;
}
