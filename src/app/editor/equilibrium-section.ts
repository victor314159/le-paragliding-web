import { Component, inject } from '@angular/core';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';
import { SelectField } from './select-field';

@Component({
  selector: 'app-equilibrium-section',
  imports: [NumberField, SelectField],
  template: `
    <div class="section-controls">
      <app-select-field
        label="Equilibrium mode"
        [field]="form.mode"
        [options]="[
          [0, 'Disabled'],
          [1, 'Enabled'],
        ]"
      />
    </div>
    @if (form.mode().value() !== 0) {
      <p>Supply the aerodynamic and mass estimates for the equilibrium calculation.</p>
      <fieldset>
        <legend>Atmosphere</legend>
        <app-number-field label="Gravity" unit="m/s²" [field]="form.gravity" />
        <app-number-field label="Air density" unit="kg/m³" [field]="form.airDensity" />
        <app-number-field label="Dynamic viscosity" unit="µPa·s" [field]="form.viscosity" />
      </fieldset>
      <fieldset>
        <legend>Aerodynamics</legend>
        <app-number-field label="Estimated speed" unit="m/s" [field]="form.speed" />
        <app-number-field label="Estimated angle of attack" unit="deg" [field]="form.alpha" />
        <app-number-field label="Lift coefficient" [field]="form.cl" />
        <app-number-field label="Lift coefficient multiplier" [field]="form.cle" />
        <app-number-field label="Drag coefficient" [field]="form.cd" />
        <app-number-field label="Drag coefficient multiplier" [field]="form.cde" />
        <app-number-field label="Moment coefficient" [field]="form.cm" />
      </fieldset>
      <fieldset>
        <legend>Wing, pilot and harness</legend>
        <app-number-field
          label="Pilot and harness frontal area"
          unit="m²"
          [field]="form.pilotSurface"
        />
        <app-number-field label="Pilot and harness drag coefficient" [field]="form.pilotDrag" />
        <app-number-field
          label="Wing mass without lines or risers"
          unit="kg"
          [field]="form.wingMass"
        />
        <app-number-field label="Pilot and harness mass" unit="kg" [field]="form.pilotMass" />
        <app-number-field
          label="Pilot mass center below karabiners"
          unit="m"
          [field]="form.pilotMassCenter"
        />
        <app-number-field label="Quick link mass" unit="g" [field]="form.quickLinkMass" />
      </fieldset>
      <fieldset>
        <legend>Center of pressure</legend>
        <app-number-field label="Center of pressure Y" unit="m" [field]="form.ycp" />
        <app-number-field label="Center of pressure Z" unit="m" [field]="form.zcp" />
      </fieldset>
    }
  `,
  styleUrl: './section.css',
})
export class EquilibriumSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.equilibrium;
}
