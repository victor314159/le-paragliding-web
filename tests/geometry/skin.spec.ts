import { expect, test } from '@playwright/test';
import { balloonedSkin, skinSubdivisions, type Point3 } from '@lepara/geometry/fortran-3.29';
import { writeLep, type LepDesign } from '../../packages/format/src/index.ts';
import { DAT_FIXTURE, DESIGNS, designFiles, engine, project } from '../format/helpers';

// Each engine allocates over 1 GiB; run the cases of this file sequentially.
test.describe.configure({ mode: 'default' });

type Case = { name: string; directory: string; edit?: (design: LepDesign) => LepDesign };
const cases: Case[] = [
  ...DESIGNS.map((id) => ({ name: id, directory: `oracle/designs/${id}` })),
  { name: 'dat airfoil', directory: DAT_FIXTURE },
  {
    name: 'classic section 5',
    directory: 'oracle/designs/swoop2',
    edit: (d) => ({ ...d, skinTensionGroups: { mode: 0 } }),
  },
  {
    name: 'legacy panel correction',
    directory: 'oracle/designs/swoop2',
    edit: (d) => ({
      ...d,
      skinTension: { ...d.skinTension, panelCorrection: { points: 15, factor: 0.9 } },
    }),
  },
  {
    name: 'closed air inlets',
    directory: 'oracle/designs/swoop2',
    edit: (d) => ({
      ...d,
      glueVents: { mode: 0 },
      airfoils: d.airfoils.map((a) => ({ ...a, open: 0 })),
    }),
  },
  {
    name: 'eight segments',
    directory: 'oracle/designs/swoop2',
    edit: (d) => ({ ...d, specialParameters: { mode: 1, entries: [{ code: 1291, value: 8 }] } }),
  },
  {
    name: 'odd central subdivisions',
    directory: 'oracle/designs/A8',
    edit: (d) => ({ ...d, specialParameters: { mode: 1, entries: [{ code: 1291, value: 7 }] } }),
  },
  {
    name: 'zero overwidth',
    directory: 'oracle/designs/swoop2',
    edit: (d) => ({
      ...d,
      skinTensionGroups: { mode: 0 },
      skinTension: {
        ...d.skinTension,
        points: d.skinTension.points.map((p) => ({
          ...p,
          extradosOverwidth: 0,
          intradosOverwidth: 0,
        })) as unknown as LepDesign['skinTension']['points'],
      },
    }),
  },
  {
    name: 'different tension point counts',
    directory: 'oracle/designs/swoop2',
    edit: (d) => ({
      ...d,
      skinTensionGroups: {
        mode: 1,
        groups: [
          {
            group: 1,
            firstRib: 1,
            lastRib: 6,
            type: 1,
            points: [d.skinTension.points[0], d.skinTension.points[2], d.skinTension.points[5]],
          },
          {
            group: 2,
            firstRib: 7,
            lastRib: d.geometry.ribs.length + 1,
            type: 1,
            points: d.skinTension.points,
          },
        ],
      },
    }),
  },
  {
    name: 'overlapping tension groups',
    directory: 'oracle/designs/swoop2',
    edit: (d) => ({
      ...d,
      skinTensionGroups: {
        mode: 1,
        groups: [
          {
            group: 1,
            firstRib: 1,
            lastRib: d.geometry.ribs.length + 1,
            type: 1,
            points: d.skinTension.points,
          },
          {
            group: 2,
            firstRib: 7,
            lastRib: 12,
            type: 1,
            points: d.skinTension.points.map((p) => ({
              ...p,
              extradosOverwidth: p.extradosOverwidth * 2,
              intradosOverwidth: p.intradosOverwidth / 2,
            })),
          },
        ],
      },
    }),
  },
];

/** The LINE entities of §21.11, in the engine's transverse/longitudinal order. */
function dxfLines(text: string): { points: readonly [Point3, Point3]; color: number }[] {
  const codes = text.split('\n').map((s) => s.trim());
  const lines: { points: readonly [Point3, Point3]; color: number }[] = [];
  codes.forEach((code, i) => {
    if (code !== 'LINE' || codes[i - 1] !== '0') return;
    const values = new Map<string, number>();
    for (let j = i + 1; j + 1 < codes.length && codes[j] !== '0'; j += 2)
      values.set(codes[j], Number(codes[j + 1]));
    const point = (keys: string[]) => keys.map((k) => values.get(k)!) as unknown as Point3;
    lines.push({
      points: [point(['10', '20', '30']), point(['11', '21', '31'])],
      color: values.get('62')!,
    });
  });
  return lines;
}

for (const { name, directory, edit } of cases) {
  test(`${name}: ballooning matches lep-3d-surfaces.dxf`, async () => {
    const files = designFiles(directory);
    const input = project(directory, files);
    const design = edit?.(input.design) ?? input.design;
    const range = { draw: 0, first: 1, last: design.geometry.ribs.length, oneSide: 0 };
    // Request all surfaces. Upstream opens the DXF only when STL is also enabled (§4.3).
    const preview: LepDesign = {
      ...design,
      dxf3d: { mode: 0 },
      shaping: {
        mode: 1,
        model: 1,
        groups: [],
        print: {
          interpolation: range,
          ovalization: range,
          tessellation: range,
          dxf: { ...range, draw: 1 },
          stl: { ...range, draw: 1 },
        },
      },
    };
    const written = writeLep(preview);
    if (!written.ok) throw new Error(JSON.stringify(written.errors));
    files.set('leparagliding.txt', written.value);
    const { runLeparaglidingInWorker } = await engine();
    const run = await runLeparaglidingInWorker(
      [...files].map(([name, text]) => ({ name, bytes: new TextEncoder().encode(text) })),
    );
    expect(run.code).toBe(0);
    const text = (name: string) =>
      new TextDecoder().decode(run.files.find((f) => f.name === name)!.bytes);
    const lines = dxfLines(text('lep-3d-surfaces.dxf'));
    // Counts come from the engine's report, independently of the port (including datair).
    const counts = text('lep-out.txt')
      .split('Rib  Total Extra Vents Intra')[1]
      .trim()
      .split('\n')
      .slice(0, design.geometry.ribs.length + 1)
      .map((s) => s.trim().split(/\s+/).map(Number));
    const steps = skinSubdivisions(design);
    const panels = balloonedSkin(design, input.airfoils);
    let cursor = 0,
      compared = 0,
      worst = 0;
    for (let i = 1; i <= design.geometry.ribs.length; i++) {
      const [, total, upper, inlet] = counts[i];
      for (const [surface, count, color] of [
        ['extrados', upper, 5],
        ['inlet', inlet, 1],
        ['intrados', total - upper - inlet + 2, 3],
      ] as const) {
        if (surface === 'intrados' && design.geometry.paragliderType === 'ss') continue;
        if (surface === 'inlet' && lines[cursor]?.color !== 1) continue;
        const panel = panels.find((p) => p.cell === i - 1 && p.surface === surface);
        const central = i === 1 && design.geometry.ribs[0].x * design.geometry.wingScale >= 0.01;
        if (i !== 1 || central) {
          expect(panel, `${name} rib ${i} ${surface}`).toBeDefined();
          expect(panel!.rows[0].length).toBe(count);
          expect(lines[cursor].color).toBe(color);
          for (let k = 0; k < panel!.rows.length; k++) {
            const index = central ? steps / 2 - k + (steps % 2 && k > 0 ? 0.5 : 0) : steps - k;
            for (let j = 0; j < count; j++) {
              const at = (index: number) =>
                lines[cursor + Math.max(0, index - 1) * count + j].points[index === 0 ? 0 : 1];
              const low = at(Math.floor(index)),
                high = at(Math.ceil(index));
              const expected = low.map(
                (v, axis) => v + (high[axis] - v) * (index - Math.floor(index)),
              );
              const actual = panel!.rows[k][j].point;
              const error = Math.max(...actual.map((v, axis) => Math.abs(v - expected[axis])));
              if (error > worst) worst = error;
              compared++;
            }
          }
        }
        cursor += steps * count + (steps + 1) * (surface === 'inlet' ? count : count - 1);
      }
    }
    expect(cursor).toBe(lines.length);
    expect(compared).toBeGreaterThan(1000);
    // DXF coordinates are rounded to 0.001 cm; all vertices must match that precision.
    expect(worst, name).toBeLessThanOrEqual(0.0006);
  });
}
