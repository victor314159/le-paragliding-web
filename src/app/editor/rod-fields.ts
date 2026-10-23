import { Component, input } from '@angular/core';
import type { EditorForm } from './editor-draft';
import { NumberField } from './number-field';

/** Curves and pockets shared by classic rods and the five bloc types. */
@Component({
  selector: 'app-rod-fields',
  imports: [NumberField],
  template: `
    <fieldset>
      <legend>Rib group</legend>
      <app-number-field
        label="Group number"
        hint="Group identifier."
        integer
        [field]="form().group"
      />
      <app-number-field
        label="First rib"
        hint="First rib in this group."
        integer
        [field]="form().firstRib"
      />
      <app-number-field
        label="Last rib"
        hint="Last rib in this group."
        integer
        [field]="form().lastRib"
      />
    </fieldset>
    @if (type() === 2) {
      <fieldset>
        <legend>Arc or straight rod</legend>
        @for (point of arc; track point.key) {
          <app-number-field
            [label]="point.label"
            unit="% chord"
            hint="Arc coordinates; zero deflection gives a straight rod."
            [field]="form()[point.key]"
          />
        }
      </fieldset>
    }
    @for (curve of curves; track curve.key) {
      @if (matches(curve.types)) {
        <fieldset>
          <legend>{{ curve.label }}</legend>
          <app-number-field
            [label]="curve.label + ' start'"
            unit="% chord"
            hint="Start of the rod curve."
            [field]="form()[curve.key].from"
          />
          <app-number-field
            [label]="curve.label + ' end'"
            unit="% chord"
            hint="End of the rod curve."
            [field]="form()[curve.key].to"
          />
          <app-number-field
            [label]="curve.label + ' deflection'"
            unit="%"
            hint="Maximum curve deflection."
            [field]="form()[curve.key].deflection"
          />
          <app-number-field
            [label]="curve.label + ' exponent'"
            hint="Exponent of the rod curve."
            [field]="form()[curve.key].exponent"
          />
        </fieldset>
      }
    }
    <fieldset>
      <legend>Rod pocket</legend>
      @for (part of pocket; track part.key) {
        <app-number-field
          [label]="part.label"
          unit="mm"
          hint="Pocket dimension."
          [field]="form().pocket[part.key]"
        />
      }
    </fieldset>
  `,
  styleUrl: './section.css',
})
export class RodFields {
  readonly form = input.required<EditorForm['joncs']['blocs'][number]['groups'][number]>();
  readonly type = input.required<number | null>();
  protected matches(types: readonly number[]): boolean {
    return types.includes(this.type() ?? 0);
  }
  protected readonly curves = [
    { key: 'extrados', label: 'Extrados curve', types: [1, 3] },
    { key: 'intrados', label: 'Intrados curve', types: [1, 3] },
    { key: 'upperRod', label: 'Upper rod bottom curve', types: [3] },
    { key: 'lowerRod', label: 'Lower rod top curve', types: [3] },
    { key: 'initial', label: 'Initial curve', types: [4, 5] },
    { key: 'final', label: 'Final curve', types: [4, 5] },
  ] as const;
  protected readonly arc = [
    { key: 'x1', label: 'Start X' },
    { key: 'y1', label: 'Start Y' },
    { key: 'x2', label: 'End X' },
    { key: 'y2', label: 'End Y' },
    { key: 'deflection', label: 'Maximum deflection' },
  ] as const;
  protected readonly pocket = [
    { key: 'offset', label: 'Rod offset' },
    { key: 'outerWidth', label: 'Outer pocket width' },
    { key: 'rodWidth', label: 'Rod width' },
    { key: 'innerWidth', label: 'Inner pocket width' },
  ] as const;
}
