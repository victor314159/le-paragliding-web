import { Component, inject } from '@angular/core';
import { ComputeControls } from './compute/compute-controls';
import { ComputeService } from './compute/compute.service';
import { DesignInput } from './inputs/design-input';
import { WingPreview } from './inputs/wing-preview';
import { Footer } from './layout/footer';
import { Intro } from './layout/intro';
import { Masthead } from './layout/masthead';
import { Results } from './results/results';

@Component({
  selector: 'app-root',
  imports: [ComputeControls, DesignInput, Footer, Intro, Masthead, Results, WingPreview],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly compute = inject(ComputeService);
}
