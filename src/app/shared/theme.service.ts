import { DOCUMENT, Injectable, inject, signal } from '@angular/core';

export type ColorScheme = 'light' | 'dark';

const STORAGE_KEY = 'lepara-color-scheme';

/**
 * The page color scheme: the system preference until the user picks one,
 * which is then remembered. The theme tokens are `light-dark()` pairs, so
 * setting `color-scheme` on the root element switches every color at once.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly system = this.document.defaultView?.matchMedia('(prefers-color-scheme: dark)');
  private readonly chosen = signal<ColorScheme | undefined>(this.load());
  private readonly systemDark = signal(this.system?.matches ?? false);

  constructor() {
    this.system?.addEventListener('change', (event) => this.systemDark.set(event.matches));
    this.apply(this.chosen());
  }

  scheme(): ColorScheme {
    return this.chosen() ?? (this.systemDark() ? 'dark' : 'light');
  }

  toggle(): void {
    const scheme = this.scheme() === 'dark' ? 'light' : 'dark';
    this.chosen.set(scheme);
    this.apply(scheme);
    try {
      localStorage.setItem(STORAGE_KEY, scheme);
    } catch {
      // Storage may be disabled; the choice then lasts for this page only.
    }
  }

  private apply(scheme: ColorScheme | undefined): void {
    const root = this.document.documentElement;
    if (scheme) root.style.colorScheme = scheme;
    // The browser chrome follows the page background.
    const page = getComputedStyle(this.document.body).backgroundColor;
    if (scheme && page)
      for (const meta of this.document.querySelectorAll('meta[name="theme-color"]'))
        meta.setAttribute('content', page);
  }

  private load(): ColorScheme | undefined {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === 'light' || stored === 'dark' ? stored : undefined;
    } catch {
      return undefined;
    }
  }
}
