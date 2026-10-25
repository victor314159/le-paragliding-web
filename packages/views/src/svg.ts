import type { PreviewScene } from './scene.ts';

/** Light colors for a standalone drawing: the app themes the same classes. */
const STYLE = `
path, circle { vector-effect: non-scaling-stroke; fill: none; stroke: #3f5aa8; stroke-width: 1.5 }
circle { fill: #3f5aa8; stroke: #fff; stroke-width: 1 }
text { fill: #1b1b1f; font-family: sans-serif }
.profile { fill: #dfe4f6 }
.baseline { stroke: #74777f; stroke-width: 1; stroke-dasharray: 4 4 }
.rib, .connection, .dimension { stroke: #74777f; stroke-width: 1 }
.allowance { stroke: #8e4585; stroke-width: 1; stroke-dasharray: 5 4 }
.hole { fill: #f2dcee; stroke: #8e4585 }
.reinforcement { fill: #3f5aa81f; stroke: #74777f; stroke-width: 1 }
.influence-upper { stroke: #13899d; stroke-width: 4 }
.influence-lower { stroke: #b38900; stroke-width: 4 }
.reinforcement-point { fill: #b38900 }
.selected { stroke: #8e4585; stroke-width: 3 }
.reinforcement.selected { fill: #b3890040; stroke: #b38900 }
.influence-upper.selected, .influence-lower.selected { stroke-width: 7 }
`;

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const kind = (name: string, selected: boolean) =>
  `class="${escape(name)}${selected ? ' selected' : ''}"`;
const tooltip = (text: string) => (text ? `<title>${escape(text)}</title>` : '');

/** A scene as a standalone SVG document, its note as description. */
export function toSvg(scene: PreviewScene): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${scene.viewBox}" font-size="${scene.fontSize}">`,
    `<title>${escape(scene.title)}</title>`,
    `<desc>${escape(scene.note)}</desc>`,
    `<style>${STYLE}</style>`,
    ...scene.paths.map(
      (p) => `<path ${kind(p.kind, p.selected)} d="${p.d}">${tooltip(p.title)}</path>`,
    ),
    ...scene.dots.map(
      (d) =>
        `<circle ${kind(d.kind, d.selected)} cx="${d.point[0]}" cy="${d.point[1]}" r="${d.radius}">${tooltip(d.title)}</circle>`,
    ),
    ...scene.labels.map(
      (l) =>
        `<text x="${l.point[0]}" y="${l.point[1]}" text-anchor="${l.anchor}"${l.fontSize === undefined ? '' : ` font-size="${l.fontSize}"`}>${escape(l.text)}</text>`,
    ),
    '</svg>',
  ].join('\n');
}
