import type { PreviewScene } from './scene.ts';

/** Light colors for a standalone drawing: the app themes the same classes. */
const STYLE = `
path, circle { vector-effect: non-scaling-stroke; fill: none; stroke: #3f5aa8; stroke-width: 1.5 }
circle { fill: #3f5aa8; stroke: #fff; stroke-width: 1 }
text { fill: #1b1b1f; font-family: sans-serif }
.profile, .outline, .modified { fill: #dfe4f6 }
.baseline, .axis, .chord { stroke: #74777f; stroke-width: 1; stroke-dasharray: 4 4 }
.rib, .connection, .dimension, .panel, .zero { stroke: #74777f; stroke-width: 1 }
.tick-grid { stroke: #c4c6d0; stroke-width: 0.6 }
.allowance { stroke: #8e4585; stroke-width: 1; stroke-dasharray: 5 4 }
.original { stroke: #8e4585; stroke-dasharray: 6 4 }
.hole, .cell-selection { fill: #f2dcee; stroke: #8e4585 }
.group-rib { stroke: #8e4585; stroke-width: 2 }
.intake { stroke: #d04b47; stroke-width: 3 }
.inlet { stroke: #8e4585; stroke-dasharray: 4 3 }
.inlet-point { fill: #d04b47 }
.hole-center { fill: #fff; stroke: #8e4585 }
.band-0 { fill: #e7e8ee; stroke: none }
.band-1 { fill: #b8dce2; stroke: none }
.band-2 { fill: #e8dbb3; stroke: none }
.extrados, .intrados { stroke-width: 2 }
path.intrados { stroke-dasharray: 6 4 }
.rib-number { fill: #44474f; text-anchor: middle; dominant-baseline: central }
.reinforcement { fill: #3f5aa81f; stroke: #74777f; stroke-width: 1 }
.influence-upper { stroke: #13899d; stroke-width: 4 }
.influence-lower { stroke: #b38900; stroke-width: 4 }
.reinforcement-point { fill: #b38900 }
.selected { stroke: #8e4585; stroke-width: 3 }
circle.selected { fill: #8e4585; stroke: #fff; stroke-width: 1 }
.ring.selected { fill: none; stroke: #8e4585; stroke-width: 2.5 }
text.selected { fill: #8e4585; stroke: none; font-weight: 700 }
.reinforcement.selected { fill: #b3890040; stroke: #b38900 }
.influence-upper.selected, .influence-lower.selected { stroke-width: 7 }
`;

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const kind = (name: string, selected: boolean) =>
  `class="${escape(name)}${selected ? ' selected' : ''}"`;
const paint = (property: 'fill' | 'stroke', color?: string) =>
  color ? ` style="${property}:${escape(color)}"` : '';
const tooltip = (text: string) => (text ? `<title>${escape(text)}</title>` : '');

/** A scene as a standalone SVG document, its note as description and its legend above. */
export function toSvg(scene: PreviewScene): string {
  const [x, y, width, height] = scene.viewBox.split(' ').map(Number);
  // The legend takes a row of text above the drawing.
  const row = scene.legend.length ? scene.fontSize * 1.5 : 0;
  let offset = x;
  const legend = scene.legend.map(({ text, color }) => {
    const entry = `<text x="${offset}" y="${y - row / 3}"${paint('fill', color)}>● ${escape(text)}</text>`;
    offset += (text.length + 3) * scene.fontSize * 0.6;
    return entry;
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y - row} ${width} ${height + row}" font-size="${scene.fontSize}">`,
    `<title>${escape(scene.title)}</title>`,
    `<desc>${escape(scene.note)}</desc>`,
    `<style>${STYLE}</style>`,
    ...scene.paths.map(
      (p) =>
        `<path ${kind(p.kind, p.selected)} d="${p.d}"${paint('stroke', p.color)}>${tooltip(p.title)}</path>`,
    ),
    ...scene.dots.map(
      (d) =>
        `<circle ${kind(d.kind, d.selected)} cx="${d.point[0]}" cy="${d.point[1]}" r="${d.radius}"${paint('fill', d.color)}>${tooltip(d.title)}</circle>`,
    ),
    ...scene.labels.map(
      (l) =>
        `<text ${kind(l.kind, l.selected)} x="${l.point[0]}" y="${l.point[1]}" text-anchor="${l.anchor}"${l.fontSize === undefined ? '' : ` font-size="${l.fontSize}"`}>${escape(l.text)}</text>`,
    ),
    ...legend,
    '</svg>',
  ].join('\n');
}
