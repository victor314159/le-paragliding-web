/**
 * A theme color as a 0xRRGGBB number, so WebGL canvases follow the theme.
 * The tokens are `light-dark()` pairs: only a computed color, in `host`, resolves them.
 */
export function themeColor(host: HTMLElement, token: string): number {
  const probe = document.createElement('span');
  probe.style.color = `var(${token})`;
  host.append(probe);
  const [r, g, b] = getComputedStyle(probe)
    .color.match(/[\d.]+/g)!
    .map(Number);
  probe.remove();
  return (r << 16) | (g << 8) | b;
}
