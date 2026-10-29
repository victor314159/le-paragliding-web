import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatCheckbox, type MatCheckboxChange } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { DesignFilesService } from '../inputs/design-files.service';
import type { ComputeStatus } from './compute.protocol';
import { ComputeService } from './compute.service';
import { ExecutionLog } from './execution-log';
import { SafetyDisclaimerDialog } from './safety-disclaimer-dialog';

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
  imports: [DecimalPipe, ExecutionLog, MatButton, MatCheckbox],
  templateUrl: './compute-controls.html',
  styleUrl: './compute-controls.css',
})
export class ComputeControls {
  protected readonly compute = inject(ComputeService);
  private readonly inputs = inject(DesignFilesService);
  private readonly dialogs = inject(MatDialog);
  protected readonly acknowledged = signal(false);
  private readonly reviewed = signal(false);
  protected readonly statusLabel = computed(() => {
    if (this.compute.status() !== 'idle') return STATUS_LABELS[this.compute.status()];
    if (this.inputs.pending()) return 'Loading input files…';
    if (!this.inputs.files().length) return 'Import input files to compute';
    if (!this.inputs.ready()) return 'Fix input errors to compute';
    return STATUS_LABELS.idle;
  });
  protected readonly canStart = computed(
    () => this.acknowledged() && this.inputs.ready() && !this.compute.busy(),
  );

  protected showDisclaimer(): void {
    this.dialogs
      .open(SafetyDisclaimerDialog, { width: '600px' })
      .afterClosed()
      .subscribe(() => this.reviewed.set(true));
  }

  /** Review the full warning before accepting it. */
  protected acknowledge(event: MatCheckboxChange): void {
    if (event.checked && !this.reviewed()) {
      event.source.checked = false;
      this.showDisclaimer();
    } else {
      this.acknowledged.set(event.checked);
    }
  }
}
