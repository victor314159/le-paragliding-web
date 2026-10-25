import { expect, test } from '@playwright/test';
import { parseLep, type LepAirfoil, type RodCurve } from '../../packages/format/src/index.ts';
import {
  ANCHOR_COLORS,
  SECTION_SCENES,
  arcPoints,
  deflectedRod,
  lineTree,
  miniribEllipses,
  reinforcementAttachments,
  ribProfile,
  rodOutlines,
  toSvg,
  ventBoundary,
  wingTipOutline,
  type PreviewContext,
  type Rod,
} from '../../packages/views/src/index.ts';
import { lep, ok } from '../format/helpers';

const ribs = { group: 1, firstRib: 1, lastRib: 2 };
const pocket = { offset: 0, outerWidth: 0, rodWidth: 0, innerWidth: 0 };
const curve = (from: number, to: number, deflection: number, exponent: number): RodCurve => ({
  from,
  to,
  deflection,
  exponent,
});

function context(): PreviewContext {
  const design = ok(parseLep(lep()));
  const foil: LepAirfoil = {
    format: 'dat',
    points: [
      [1, 0],
      [0.5, 0.1],
      [0, 0],
      [0.5, -0.1],
      [1, 0],
    ],
  };
  return {
    design: {
      ...design,
      geometry: {
        ...design.geometry,
        ribs: [
          {
            ...design.geometry.ribs[0],
            x: 0,
            yLE: 0,
            yTE: 100,
            xp: 0,
            z: 0,
            beta: 0,
            washin: 0,
            rotationPoint: 0,
            rotZ: 0,
          },
          {
            ...design.geometry.ribs[0],
            x: 40,
            yLE: 10,
            yTE: 90,
            xp: 40,
            z: 0,
            beta: 0,
            washin: 0,
            rotationPoint: 0,
            rotZ: 0,
          },
        ],
      },
      airfoils: [0, 1].map((i) => ({
        ...design.airfoils[0],
        number: i + 1,
        airfoil: 'test.dat',
        minirib: 25,
      })),
      anchors: [0, 1].map((i) => ({
        number: i + 1,
        count: 2,
        positions: [25, 75, 0, 0, 0, 95] as const,
      })),
      thickness: { mode: 0 },
    },
    airfoils: new Map([['test.dat', foil]]),
    view: '',
    rib: 0,
    selected: 0,
    active: 0,
    secondary: 0,
    surface: 'upper',
  };
}

test('line trees merge common branch prefixes and retain fractional brake anchors', () => {
  const path = {
    levels: 2,
    branches: [
      [1, 1],
      [2, 1],
      [0, 0],
      [0, 0],
    ] as const,
    anchorRow: 6,
    anchorRib: 2.4,
    lineTypes: [1, 2],
  };
  const data = lineTree([path, { ...path, anchorRib: 4 }]);
  expect(data.nodes.filter((n) => n.level === 1)).toHaveLength(1);
  expect(data.nodes.filter((n) => n.level === 2)).toHaveLength(1);
  expect(data.leaves.map((p) => p.rib)).toEqual([2.4, 4]);
  expect(data.edges.find((edge) => edge.to.endsWith('2.1'))?.paths).toEqual([0, 1]);
  expect(lineTree([{ ...path, levels: Number.NaN }]).omitted).toBe(1);
});

test('HVR attachments convert centimetres versus chord percentages and keep asymmetric radii', () => {
  const c = context();
  const pieces = (type: number) =>
    reinforcementAttachments({
      ...c.design,
      hvRibs: {
        ...c.design.hvRibs,
        ribs: [{ number: 1, type, parameters: [1, 25, 0, 2, 3, 2, 75, 100, 4, 5] }],
      },
    });
  const absolute = pieces(6)[0].attachments;
  expect(absolute[0]).toMatchObject({ rib: 1, x: 0.25, height: 0, before: 0.02, after: 0.03 });
  expect(absolute[1].before).toBeCloseTo(0.05);
  const relative = pieces(16)[0].attachments;
  expect(relative[1].before).toBeCloseTo(0.04);
  expect(relative[1].after).toBeCloseTo(0.05);
});

test('rod curves apply power-law deflection and keep valid zero-thickness and straight rods', () => {
  const c = context();
  const profile = ribProfile(c.design, c.airfoils, 0);
  const rod = deflectedRod(profile.upper, curve(0, 50, 2, 2), 1);
  expect(rod[0]).toEqual([0, 0]);
  expect(rod.at(-1)?.[1]).toBeCloseTo(-0.08);
  const straight: Rod = {
    type: 2,
    group: { ...ribs, x1: 10, y1: 2, x2: 70, y2: 2, deflection: 0, pocket },
  };
  expect(rodOutlines(straight, profile)[0]).toEqual([
    [0.1, -0.02],
    [0.7, -0.02],
  ]);
  const arc = arcPoints([0, 0], [10, 0], 2);
  expect(arc[0][0]).toBeCloseTo(0);
  expect(arc.at(-1)?.[0]).toBeCloseTo(10);
  expect(arc[30][1]).toBeCloseTo(2);
});

test('normalized inlet boundaries implement diagonals, signed arches and ellipse widths', () => {
  expect(ventBoundary(-2, [])[1]).toEqual([
    [0, 100],
    [100, 0],
  ]);
  expect(ventBoundary(-3, [])[1]).toEqual([
    [0, 0],
    [100, 100],
  ]);
  const positive = ventBoundary(5, [50, 50, 10])[1];
  const negative = ventBoundary(-5, [50, 50, 10])[1];
  expect(positive[30][1]).toBeCloseTo(40);
  expect(negative[30][1]).toBeCloseTo(60);
  const ellipse = ventBoundary(6, [80, 60])[1];
  expect(Math.min(...ellipse.map(([x]) => x))).toBeCloseTo(10);
  expect(Math.max(...ellipse.map(([, y]) => y))).toBeCloseTo(80);
});

test('long and shark-nose rods retain both transitions and valid contour coordinates', () => {
  const c = context();
  const profile = ribProfile(c.design, c.airfoils, 0);
  const extrados = curve(5, 40, 1, 2);
  const intrados = curve(10, 30, 1, 2);
  const long = { ...ribs, initial: curve(5, 15, 2, 2), final: curve(50, 80, 1, 2), pocket };
  const rods: Rod[] = [
    { type: 1, group: { ...ribs, extrados, intrados, pocket } },
    {
      type: 3,
      group: {
        ...ribs,
        extrados,
        upperRod: curve(20, 5, 2, 1),
        lowerRod: curve(10, 5, 2, 1),
        intrados,
        pocket,
      },
    },
    { type: 4, group: long },
    { type: 5, group: long },
  ];
  for (const rod of rods) {
    const outlines = rodOutlines(rod, profile);
    expect(outlines).toHaveLength(rod.type === 3 ? 2 : 1);
    expect(
      outlines.every((o) => o.length > 2 && o.every((point) => point.every(Number.isFinite))),
    ).toBe(true);
  }
  // The initial part of a long rod deflects maximally at its nose end,
  // then joins the original contour before the final part starts.
  expect(rodOutlines(rods[2], profile)[0][0][1]).toBeCloseTo(0.01);
});

test('four-level ramification drawings place the main junction at l3 and upper junctions at l2', () => {
  const c = context();
  const scene = SECTION_SCENES.get(11)!.draw({
    ...c,
    view: 'lines4',
    design: {
      ...c.design,
      ramifications: { ...c.design.ramifications, lines4: { level: 4, l3: 275, l2: 85 } },
    },
  });
  const connections = scene.paths.filter((path) => path.kind === 'connection');
  expect(connections.at(-1)?.d).toBe('M0,100 L0,130');
  expect(connections[0].d).toContain('L-25,30.909');
});

test('wingtip angles and type 9 hole fields follow the engine geometry and column order', () => {
  const c = context();
  const tip = wingTipOutline({
    ...c.design,
    wingTip: { mode: 1, angleLE: 45, angleTE: 0 },
  });
  expect(tip.modified[1][1]).toBeCloseTo(40);
  expect(tip.modified[2][1]).toBe(100);
  const row = {
    number: 1,
    type: 9,
    drawn: 1,
    holes: 2,
    height: 60,
    width: 0.5,
    center: -0.2,
    offset: 30,
    unused: 0,
  };
  const holes = miniribEllipses(row, 0.25, 0.1);
  expect(holes).toHaveLength(2);
  expect(holes[0].a / holes[0].b).toBeCloseTo(0.5);
  expect(holes[0].angle).toBeCloseTo(-Math.PI / 6);
  expect(holes[0].center[1]).toBeGreaterThan(0);
});

test('every detail preview and view handles empty collections and disabled sections without nonfinite SVG data', () => {
  const c = context();
  for (const [section, definition] of SECTION_SCENES) {
    for (const [view] of definition.views.length ? definition.views : [['', '']]) {
      const scene = definition.draw({ ...c, view });
      expect(scene.title, `section ${section}`).not.toBe('');
      expect(scene.viewBox.split(' ').map(Number).every(Number.isFinite)).toBe(true);
      expect(scene.paths.every((p) => !/NaN|Infinity/.test(p.d))).toBe(true);
    }
  }
});

test('a scene is a standalone SVG document, its texts escaped', () => {
  const scene = SECTION_SCENES.get(11)!.draw({ ...context(), view: 'lines4' });
  const svg = toSvg({ ...scene, title: 'A & <B>' });
  expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="[^"]+"/);
  expect(svg).toContain('<title>A &#38; &#60;B&#62;</title>');
  expect(svg.match(/<path /g)).toHaveLength(scene.paths.length);
  expect(svg.match(/<text /g)).toHaveLength(scene.labels.length);
  expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
});

test('anchor rows keep their colors and legend in the scene and its SVG', () => {
  const scene = SECTION_SCENES.get(3)!.draw({ ...context(), view: 'planform' });
  const tracks = scene.paths.filter((p) => p.kind === 'anchor-track');
  expect(tracks.map((p) => p.color)).toEqual(ANCHOR_COLORS);
  expect(scene.legend.map((entry) => entry.color)).toEqual(ANCHOR_COLORS);
  const svg = toSvg(scene);
  expect(svg).toContain(
    `class="anchor-track" d="${tracks[0].d}" style="stroke:${ANCHOR_COLORS[0]}"`,
  );
  expect(svg).toContain(`style="fill:${ANCHOR_COLORS[5]}">● F · brake</text>`);
});
