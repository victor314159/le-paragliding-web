import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatCheckbox, type MatCheckboxChange } from '@angular/material/checkbox';
import {
  MatExpansionPanel,
  MatExpansionPanelHeader,
  MatExpansionPanelTitle,
} from '@angular/material/expansion';
import { DesignFilesService } from '../inputs/design-files.service';
import { LINKS } from '../shared/links';
import type { ComputeStatus } from './compute.protocol';
import { ComputeService } from './compute.service';

const STATUS_LABELS: Record<ComputeStatus, string> = {
  idle: 'Ready to compute',
  loading: 'Loading engine…',
  running: 'Computing design…',
  done: 'Computation complete',
  cancelled: 'Computation cancelled',
  error: 'Computation failed',
};

/** Safety disclaimer, then start, follow and cancel a calculation. */
@Component({
  selector: 'app-compute-controls',
  imports: [
    DecimalPipe,
    MatButton,
    MatCheckbox,
    MatExpansionPanel,
    MatExpansionPanelHeader,
    MatExpansionPanelTitle,
  ],
  templateUrl: './compute-controls.html',
  styleUrl: './compute-controls.css',
})
export class ComputeControls {
  protected readonly compute = inject(ComputeService);
  private readonly inputs = inject(DesignFilesService);
  protected readonly links = LINKS;
  protected readonly acknowledged = signal(false);
  protected readonly statusLabel = computed(() => STATUS_LABELS[this.compute.status()]);
  protected readonly canStart = computed(
    () => this.acknowledged() && this.inputs.ready() && !this.compute.busy(),
  );

  /** The first acknowledgement opens the disclaimer, so it is read before it is accepted. */
  protected acknowledge(event: MatCheckboxChange, disclaimer: MatExpansionPanel): void {
    if (event.checked && !disclaimer.expanded) {
      disclaimer.open();
      event.source.checked = false;
      return;
    }
    this.acknowledged.set(event.checked);
  }
}
