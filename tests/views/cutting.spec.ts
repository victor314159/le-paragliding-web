import { expect, test } from '@playwright/test';
import {
  miniribPatterns,
  ribPatterns,
  skinPanels,
  unloadedRibPatterns,
  vRibPatterns,
} from '@lepara/geometry/enhanced-v1';
import {
  cuttingScene,
  panelNumber,
  PATTERN_GROUPS,
  gridLength,
  toSvg,
} from '../../packages/views/src/index.ts';
import { DESIGNS, project } from '../format/helpers';

for (const id of DESIGNS)
  test(`${id}: cutting patterns draw each panel once, numbered as the engine does`, () => {
    const { design, airfoils } = project(`oracle/designs/${id}`);
    const panels = skinPanels(design, airfoils);
    for (const [group] of PATTERN_GROUPS) {
      if (group !== 'extrados' && group !== 'intrados') continue;
      const scene = cuttingScene(design, airfoils, group);
      const expected = panels.filter((panel) => panel.surface === group);
      expect(scene.viewBox).not.toContain('NaN');
      const sewing = scene.paths.filter((path) => path.kind === 'outline');
      expect(sewing.map((path) => path.title)).toEqual(
        expected.map((panel) => `Panel ${panelNumber(panels, panel)}`),
      );
      expect(scene.paths.filter((path) => path.kind === 'allowance')).toHaveLength(
        expected.reduce((sum, panel) => sum + 1 + panel.holes.length, 0),
      );
      expect(
        scene.paths.filter((path) => path.kind !== 'rib').every((path) => path.d.endsWith('Z')),
      ).toBe(true);
      expect(scene.paths.filter((path) => path.kind === 'rib')).toHaveLength(
        expected.reduce((sum, panel) => sum + panel.joins.length, 0),
      );
      const dots = (kind: string) => scene.dots.filter((dot) => dot.kind === kind).length;
      expect(dots('mark')).toBe(expected.reduce((sum, panel) => sum + panel.marks.length, 0));
      expect(dots('numeral')).toBe(expected.reduce((sum, panel) => sum + panel.numeral.length, 0));
      const anchors =
        dots('table-mark') + scene.paths.filter((p) => p.kind === 'table-mark').length;
      expect(anchors).toBe(
        expected.reduce((sum, p) => sum + p.anchors.dots.length + p.anchors.lines.length, 0),
      );
      if (group === 'intrados' && expected.length) expect(anchors).toBeGreaterThan(0);
      if (!expected.length) expect(scene.labels[0].text).toContain('single-skin');
      if (id === 'gnu-test-3.19' && group === 'extrados')
        expect(scene.labels.map((label) => label.text)).toContain('5c');
    }
  });

for (const id of DESIGNS)
  test(`${id}: rib patterns draw each rib, its open cut line and its holes`, () => {
    const { design, airfoils } = project(`oracle/designs/${id}`);
    const ribs = ribPatterns(design, airfoils);
    const scene = cuttingScene(design, airfoils, 'ribs');
    expect(scene.viewBox).not.toContain('NaN');
    const miniribs = miniribPatterns(design, airfoils);
    expect(scene.paths.filter((path) => path.kind === 'outline').map((path) => path.title)).toEqual(
      [
        ...ribs.map((rib) => `Rib ${rib.rib + 1}`),
        ...miniribs.map((minirib) => `Minirib ${minirib.rib}`),
      ],
    );
    if (design.geometry.paragliderType === 'ds') expect(miniribs.length).toBeGreaterThan(0);
    const cuts = scene.paths.filter((path) => path.kind === 'allowance');
    expect(cuts).toHaveLength(
      ribs.reduce((sum, rib) => sum + rib.cut.length + rib.holes.length, 0) +
        miniribs.reduce((sum, minirib) => sum + minirib.cut.length + minirib.holes.length, 0),
    );
    expect(cuts.filter((path) => !path.d.endsWith('Z'))).toHaveLength(
      ribs.reduce((sum, rib) => sum + rib.cut.length, 0) +
        miniribs.reduce((sum, minirib) => sum + minirib.cut.length, 0),
    );
    const count = (kind: string) => scene.dots.filter((dot) => dot.kind === kind).length;
    expect(count('mark')).toBe(ribs.reduce((sum, rib) => sum + rib.marks.length, 0));
    expect(count('numeral')).toBe(
      [...ribs, ...miniribs].reduce((sum, piece) => sum + piece.numeral.length, 0),
    );
    const table = ribs.flatMap((rib) => [rib.anchors, rib.inlets]);
    const rods = ribs.flatMap((rib) => rib.rods);
    expect(count('table-mark')).toBe(
      table.reduce((sum, marks) => sum + marks.dots.length, 0) +
        ribs.reduce((sum, rib) => sum + rib.points.length + rib.vRibs.table.dots.length, 0) +
        4 * rods.length,
    );
    expect(scene.paths.filter((path) => path.kind === 'table-mark')).toHaveLength(
      table.reduce((sum, marks) => sum + marks.lines.length, 0) +
        ribs.reduce((sum, rib) => sum + (rib.mylar?.ends.length ?? 0), 0),
    );
    expect(scene.paths.some((path) => path.title === 'Anchor')).toBe(true);
    expect(scene.paths.filter((path) => path.title === 'Nylon rod')).toHaveLength(2 * rods.length);
    expect(scene.paths.filter((path) => path.title === 'V-rib seam').length).toBe(
      ribs.reduce((sum, rib) => sum + rib.vRibs.lines.length, 0),
    );
    if (design.joncs.mode !== 0) expect(rods.length).toBeGreaterThan(0);
  });

for (const id of DESIGNS)
  test(`${id}: rod pockets and mylars draw each piece with its number`, () => {
    const { design, airfoils } = project(`oracle/designs/${id}`);
    const ribs = ribPatterns(design, airfoils);
    const scene = cuttingScene(design, airfoils, 'reinforcements');
    expect(scene.viewBox).not.toContain('NaN');
    const outlines = scene.paths.filter((path) => path.kind === 'outline');
    expect(outlines.map((path) => path.title)).toEqual(
      ribs.flatMap(({ rib, rods, mylar }) => [
        ...rods.map(
          (rod, k) =>
            `Rod pocket ${rib + 1}${rods.length > 1 ? 'abcdefgh'[k] : ''}, type ${rod.type}`,
        ),
        ...(mylar ? [`Nose mylar ${rib + 1}`] : []),
      ]),
    );
    expect(scene.dots.filter((dot) => dot.kind === 'numeral').length).toBe(
      ribs.reduce(
        (sum, rib) =>
          sum +
          rib.rods.reduce((n, rod) => n + rod.numeral.length, 0) +
          (rib.mylar?.numeral.length ?? 0),
        0,
      ),
    );
    if (!outlines.length) expect(scene.labels[0].text).toContain('Sections 21 and 22');
  });

for (const id of DESIGNS)
  test(`${id}: H straps and V-ribs draw each piece, its cut lines and its holes`, () => {
    const { design, airfoils } = project(`oracle/designs/${id}`);
    const pieces = vRibPatterns(design, airfoils);
    const scene = cuttingScene(design, airfoils, 'vribs');
    expect(scene.viewBox).not.toContain('NaN');
    expect(scene.paths.filter((path) => path.kind === 'outline').map((path) => path.title)).toEqual(
      pieces.map(
        ({ type, ribs }) =>
          `${type === 1 ? 'H strap' : 'V-rib'} ${ribs.join('-')}${type === 1 ? '' : `, type ${type}`}`,
      ),
    );
    const holes = scene.paths.filter((path) => path.title === 'Hole');
    expect(holes).toHaveLength(pieces.reduce((sum, piece) => sum + piece.holes.length, 0));
    if (id === 'swoop2') expect(holes.length).toBeGreaterThan(0);
  });

test('marks keep their size on the fabric unless enlarged', () => {
  const { design, airfoils } = project('oracle/designs/A8');
  const radii = (enlarged: boolean) =>
    new Set(
      cuttingScene(design, airfoils, 'extrados', enlarged)
        .dots.filter((dot) => dot.kind === 'mark')
        .map((dot) => dot.radius),
    );
  // Section 20, row 1: laser circles 0.3 mm in radius.
  expect([...radii(false)]).toEqual([0.03]);
  expect(Math.min(...radii(true))).toBeGreaterThan(0.3);
});

test('unloaded ribs follow the miniribs, numbered u', () => {
  const { design: input, airfoils } = project('oracle/designs/gnuC-27');
  const design = {
    ...input,
    airfoils: input.airfoils.map((row, k) => (k === 5 || k === 6 ? { ...row, minirib: 100 } : row)),
  };
  const unloaded = unloadedRibPatterns(design, airfoils);
  expect(unloaded.map((rib) => rib.rib)).toEqual([6, 7]);
  const scene = cuttingScene(design, airfoils, 'ribs');
  expect(scene.viewBox).not.toContain('NaN');
  const titles = scene.paths.filter((path) => path.kind === 'outline').map((path) => path.title);
  expect(titles.slice(-2)).toEqual(['Unloaded rib 6', 'Unloaded rib 7']);
  expect(titles).not.toContain('Minirib 6');
  expect(scene.labels.map((label) => label.text)).toContain('u7');
  // Their seams along the middle of cells 5 and 6.
  for (const group of ['extrados', 'intrados'] as const) {
    const seams = cuttingScene(design, airfoils, group).dots.filter(
      (dot) => dot.title === 'Unloaded rib seam',
    );
    expect(seams).toHaveLength(
      skinPanels(design, airfoils)
        .filter((panel) => panel.surface === group)
        .reduce((sum, panel) => sum + panel.unloadedSeam.length, 0),
    );
    expect(seams.length).toBeGreaterThan(8);
  }
});

test('a "pc" wing draws its ribs, their inlets closed', () => {
  const { design: input, airfoils } = project('oracle/designs/A8');
  const design = { ...input, geometry: { ...input.geometry, paragliderType: 'pc' as const } };
  const ribs = ribPatterns(design, airfoils);
  expect(ribs).toHaveLength(design.geometry.ribs.length);
  const scene = cuttingScene(design, airfoils, 'ribs');
  expect(scene.viewBox).not.toContain('NaN');
  expect(scene.paths.filter((path) => path.kind === 'outline')[0].title).toBe('Rib 1');
  // The inlet's inner points are left out of the sewing line.
  const [ds] = ribPatterns(input, airfoils);
  expect(ds.sewing.length - ribs[0].sewing.length).toBeGreaterThan(0);
});

test('the legend of the cutting patterns explains the styles each group draws', () => {
  const { design, airfoils } = project(`oracle/designs/${DESIGNS[0]}`);
  for (const [group] of PATTERN_GROUPS) {
    const scene = cuttingScene(design, airfoils, group);
    const kinds = new Set([...scene.paths, ...scene.dots].map((item) => item.kind));
    expect(new Set(scene.legend.map((entry) => entry.sample?.kind))).toEqual(kinds);
    expect(scene.legend.every((entry) => entry.text)).toBe(true);
  }
  const { legend } = cuttingScene(design, airfoils, 'extrados');
  expect(legend[0]).toEqual({
    text: 'Sewing line',
    sample: { kind: 'outline', dot: false },
  });
  expect(legend.find((entry) => entry.sample?.kind === 'allowance')?.text).toContain('Cut line');
  expect(legend.find((entry) => entry.sample?.kind === 'mark')?.sample?.dot).toBe(true);
  expect(toSvg(cuttingScene(design, airfoils, 'extrados'))).toContain('>Sewing line</text>');
});

test('a grid takes a round length, and the patterns give their unit', () => {
  expect([1, 1.9, 2, 4.9, 5, 9.9, 10, 73, 0.3].map(gridLength)).toEqual([
    1, 1, 2, 2, 5, 5, 10, 50, 0.2,
  ]);
  const { design, airfoils } = project(`oracle/designs/${DESIGNS[0]}`);
  expect(cuttingScene(design, airfoils, 'ribs').unit).toBe('cm');
});
