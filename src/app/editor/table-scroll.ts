import { afterNextRender, DestroyRef, Directive, ElementRef, inject, signal } from '@angular/core';

/**
 * The frame of a parameter table. A table that fits does not scroll: the
 * section scrolls it, and its header sticks to the section. Only a table wider
 * than the section scrolls, horizontally, with a header that scrolls away.
 */
@Directive({
  selector: 'div[appTableScroll]',
  host: {
    class: 'table-scroll',
    '[class.wide]': 'wide()',
    '[attr.tabindex]': 'wide() ? 0 : null',
  },
})
export class TableScroll {
  private readonly frame = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly wide = signal(false);

  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const table = this.frame.querySelector('table');
      if (!table) return;
      const observer = new ResizeObserver(() => {
        const wide = table.offsetWidth > this.frame.clientWidth;
        if (wide === this.wide()) return;
        this.wide.set(wide);
        // A field focused while the frame clipped could not be scrolled to.
        const focused = document.activeElement;
        if (wide && focused && this.frame.contains(focused))
          requestAnimationFrame(() => focused.scrollIntoView({ block: 'nearest' }));
      });
      observer.observe(this.frame);
      observer.observe(table);
      destroy.onDestroy(() => observer.disconnect());
    });
  }
}
