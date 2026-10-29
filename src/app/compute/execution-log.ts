import {
  afterRenderEffect,
  Component,
  effect,
  type ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ComputeService } from './compute.service';

/** Live engine output, pinned to the newest line unless the user scrolls up. */
@Component({
  selector: 'app-execution-log',
  templateUrl: './execution-log.html',
  styleUrl: './execution-log.css',
  host: { role: 'region', 'aria-label': 'Computation log' },
})
export class ExecutionLog {
  protected readonly compute = inject(ComputeService);
  protected readonly expanded = signal(false);
  private readonly terminal = viewChild.required<ElementRef<HTMLElement>>('terminal');

  // Only real scroll events update this, so bursts of appended lines (which
  // grow the gap without the user moving) never look like scrolling away.
  private followTail = true;

  constructor() {
    effect(() => {
      if (this.compute.status() === 'error') this.expanded.set(true);
    });
    // Reading the log count makes the effect re-run when lines arrive.
    afterRenderEffect(() => {
      if (this.compute.logs().length === 0) {
        this.followTail = true;
        return;
      }
      if (!this.expanded() || !this.followTail) return;
      const element = this.terminal().nativeElement;
      element.scrollTop = element.scrollHeight;
    });
  }

  protected onScroll(): void {
    const element = this.terminal().nativeElement;
    this.followTail = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
  }
}
