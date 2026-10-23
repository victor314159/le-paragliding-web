import { expect, test } from '@playwright/test';
import type { Diagnostic, LepProject } from '../packages/format/src/index.ts';
import { parseLep, writeLep } from '../packages/format/src/index.ts';
import { EditorDraft, type DesignForm } from '../src/app/editor/editor-draft.ts';
import { lep, ok } from './format/helpers';

/** Synthetic objects only: no files, Angular services or browser required. */
function fixture(): LepProject {
  return {
    design: ok(parseLep(lep())),
    airfoils: new Map([
      [
        'gnua.txt',
        {
          format: 'txt',
          extrados: 2,
          inlet: 3,
          intrados: 2,
          points: [
            [1, 0],
            [0, 0],
            [0.016, -0.02],
            [0.063, -0.03],
            [1, 0],
          ],
        },
      ],
    ]),
  };
}

function set<K extends keyof DesignForm>(
  draft: EditorDraft,
  key: K,
  value: (section: DesignForm[K]) => DesignForm[K],
): void {
  draft.value.update((form) => ({ ...form, [key]: value(form[key]) }));
}

const errors = (draft: EditorDraft) => draft.diagnostics().filter((d) => d.severity === 'error');

test('the draft starts with the supplied project, unchanged and without errors', () => {
  const initial = fixture();
  const draft = new EditorDraft(initial);
  expect(draft.project()).toEqual(initial);
  expect(draft.project().airfoils).toBe(initial.airfoils);
  expect(errors(draft)).toEqual([]);
  expect(draft.errors()).toEqual([]);
  expect(draft.changed()).toBe(false);
});

test('an emptied number is an error on its field, then a valid one is kept', () => {
  const initial = fixture();
  const draft = new EditorDraft(initial);
  set(draft, 'sewingAllowances', (s) => ({ ...s, ribs: null }));
  expect(draft.changed()).toBe(true);
  expect(draft.errors()).toEqual([
    expect.objectContaining({ section: 6, field: 'sewingAllowances.ribs' }),
  ]);
  set(draft, 'sewingAllowances', (s) => ({ ...s, ribs: 12.75 }));
  expect(draft.project().design.sewingAllowances.ribs).toBe(12.75);
  expect(draft.errors()).toEqual([]);
  expect(initial.design.sewingAllowances.ribs).toBe(15);
});

test('DXF mode switches keep the fields of mode 1, but only the selected mode is written', () => {
  const draft = new EditorDraft(fixture());
  // Mode 0 starts from the engine's colors.
  expect(draft.value().dxf2d).toEqual({ mode: 0, lineColors: [1, 30, 3, 4, 6, 5] });
  set(draft, 'dxf2d', () => ({ mode: 1, lineColors: [null, 91, 92, 93, 94, 95] }));
  expect(draft.errors()).toEqual([
    expect.objectContaining({ section: 24, field: 'dxf2d.lineColors[0]' }),
  ]);
  set(draft, 'dxf2d', (s) => ({ ...s, mode: 0 }));
  expect(draft.project().design.dxf2d).toEqual({ mode: 0 });
  expect(draft.errors()).toEqual([]);
  set(draft, 'dxf2d', (s) => ({ ...s, mode: 1 }));
  expect(draft.value().dxf2d.lineColors[0]).toBeNull();
  set(draft, 'dxf2d', () => ({ mode: 1, lineColors: [1.5, 91, 92, 93, 94, 95] }));
  expect(draft.errors()).toEqual([expect.objectContaining({ field: 'dxf2d.lineColors[0]' })]);
});

test('3D surfaces and colors survive mode switches and write back exactly', () => {
  const draft = new EditorDraft(fixture());
  expect(draft.value().dxf3d.lineColors).toEqual([8, 8, 8, 8, 8, 30]);
  const custom = {
    mode: 1,
    lineColors: [21, 22, 23, 24, 25, 26],
    surfaces: [
      { drawn: 1, color: 41 },
      { drawn: 0, color: 42 },
      { drawn: 1, color: 43 },
    ],
  } as const;
  set(draft, 'dxf3d', () => custom);
  set(draft, 'dxf3d', (s) => ({ ...s, mode: 0 }));
  expect(draft.project().design.dxf3d).toEqual({ mode: 0 });
  set(draft, 'dxf3d', (s) => ({ ...s, mode: 1 }));
  expect(draft.project().design.dxf3d).toEqual(custom);
  const { design } = draft.project();
  expect(ok(parseLep(ok(writeLep(design))))).toEqual(design);
});

test('an equal value, or a hidden field, changes nothing', () => {
  const draft = new EditorDraft(fixture());
  set(draft, 'sewingAllowances', (s) => ({ ...s, ribs: 15.0 }));
  set(draft, 'dxf2d', (s) => ({ ...s, lineColors: [1, 30, 3, 4, 6, 7] }));
  expect(draft.changed()).toBe(false);
});

test('reading warnings remain nonblocking', () => {
  const warning: Diagnostic = { severity: 'warning', file: 'gnua.txt', message: 'A warning' };
  const draft = new EditorDraft(fixture(), [warning]);
  expect(draft.errors()).toEqual([]);
  expect(draft.diagnostics()).toContainEqual(warning);
});

test('a missing airfoil is shown but does not block Save', () => {
  const { design } = fixture();
  const draft = new EditorDraft({ design, airfoils: new Map() });
  expect(errors(draft)).toContainEqual(expect.objectContaining({ section: 2 }));
  expect(draft.errors()).toEqual([]);
});

test('a warning on an edited field does not block Save', () => {
  const draft = new EditorDraft(fixture());
  set(draft, 'dxf2d', (s) => ({ ...s, mode: 1, lineColors: [257, 30, 3, 4, 6, 5] }));
  expect(draft.diagnostics()).toContainEqual(
    expect.objectContaining({ severity: 'warning', field: 'dxf2d.lineColors[0]' }),
  );
  expect(draft.errors()).toEqual([]);
});

test('a design error in another section blocks Save, since writeLep refuses it', () => {
  const { design, airfoils } = fixture();
  const angleOfAttack = { ...design.angleOfAttack, linesLength: 0 };
  const draft = new EditorDraft({ design: { ...design, angleOfAttack }, airfoils });
  expect(draft.errors()).toEqual([
    expect.objectContaining({ section: 8, field: 'angleOfAttack.linesLength' }),
  ]);
});

test('every example and format variant survives all form expansions without changing the design', async () => {
  const { readFile } = await import('node:fs/promises');
  const { default: index } = await import('../oracle/designs/index.json', {
    with: { type: 'json' },
  });
  const { VARIANTS, variantFiles } = await import('./format/variants');
  const texts = await Promise.all(
    index.map((entry) => readFile(`oracle/designs/${entry.id}/leparagliding.txt`, 'utf8')),
  );
  for (const variant of VARIANTS) texts.push(variantFiles(variant).get('leparagliding.txt')!);
  for (const text of texts) {
    const design = ok(parseLep(text));
    const draft = new EditorDraft({ design, airfoils: new Map() });
    expect(draft.project().design).toEqual(design);
    expect(draft.changed()).toBe(false);
    expect(ok(parseLep(ok(writeLep(draft.project().design))))).toEqual(design);
  }
});

test('color layouts and wing-tip modes keep hidden edits and write only active fields', () => {
  const draft = new EditorDraft(fixture());
  set(draft, 'extradosColors', (s) => ({
    ...s,
    mode: 'panels',
    panels: [{ panel: 1, cuts: [{ number: 1, left: 20, right: 30, seamWidth: null, unused: 0 }] }],
  }));
  expect(draft.errors()).toContainEqual(
    expect.objectContaining({ field: 'extradosColors.panels[0].cuts[0].seamWidth' }),
  );
  set(draft, 'extradosColors', (s) => ({ ...s, mode: 'ribs' }));
  expect(draft.project().design.extradosColors).toEqual({ mode: 'ribs', ribs: [] });
  expect(draft.errors()).toEqual([]);
  set(draft, 'extradosColors', (s) => ({ ...s, mode: 'panels' }));
  expect(draft.value().extradosColors.panels[0].cuts[0].seamWidth).toBeNull();
  set(draft, 'wingTip', (s) => ({ ...s, mode: 2, distance: 15, angle: null }));
  set(draft, 'wingTip', (s) => ({ ...s, mode: 4, displacement: 1, rotation: 2 }));
  expect(draft.project().design.wingTip).toEqual({ mode: 4, displacement: 1, rotation: 2 });
  set(draft, 'wingTip', (s) => ({ ...s, mode: 2 }));
  expect(draft.value().wingTip.angle).toBeNull();
});

test('rod and line types retain all variant fields without leaking them into the design', async () => {
  const { rodGroup } = await import('../src/app/editor/editor-draft.ts');
  const draft = new EditorDraft(fixture());
  const group = { ...rodGroup(), x1: 12, upperRod: { from: 1, to: 2, deflection: 3, exponent: 4 } };
  set(draft, 'joncs', (s) => ({ ...s, mode: 2, blocs: [{ number: 1, type: 2, groups: [group] }] }));
  const arc = draft.project().design.joncs;
  expect(arc).toEqual({
    mode: 2,
    blocs: [
      {
        number: 1,
        type: 2,
        groups: [
          {
            group: 1,
            firstRib: 1,
            lastRib: 1,
            x1: 12,
            y1: 0,
            x2: 0,
            y2: 0,
            deflection: 0,
            pocket: group.pocket,
          },
        ],
      },
    ],
  });
  set(draft, 'joncs', (s) => ({ ...s, blocs: s.blocs.map((b) => ({ ...b, type: 3 })) }));
  expect(draft.project().design.joncs).toEqual({
    mode: 2,
    blocs: [
      {
        number: 1,
        type: 3,
        groups: [
          {
            group: 1,
            firstRib: 1,
            lastRib: 1,
            extrados: group.extrados,
            intrados: group.intrados,
            upperRod: group.upperRod,
            lowerRod: group.lowerRod,
            pocket: group.pocket,
          },
        ],
      },
    ],
  });
  set(draft, 'joncs', (s) => ({ ...s, mode: 0 }));
  expect(draft.project().design.joncs).toEqual({ mode: 0 });
  expect(draft.value().joncs.blocs[0].groups[0].x1).toBe(12);
  set(draft, 'lineTypes', (s) => ({
    ...s,
    mode: 1,
    types: s.types.map((t, i) => (i === 0 ? { ...t, kind: 'c', diameter: 2.5 } : t)),
  }));
  const line = draft.project().design.lineTypes;
  expect(line.mode).toBe(1);
  if (line.mode === 1) {
    expect(line.types[0]).toMatchObject({ kind: 'c', diameter: 2.5 });
    expect(line.types[0]).not.toHaveProperty('width');
  }
  expect(draft.value().lineTypes.types[0].width).toBe(25);
});

test('line type lists, vent parameters and rib columns follow their selected layouts', () => {
  const draft = new EditorDraft(fixture());
  const original = draft.project().design;
  set(draft, 'lines', (s) => ({ ...s, typed: true }));
  const path = draft.project().design.lines.plans[0].paths[0];
  expect(path.lineTypes).toHaveLength(path.levels);
  set(draft, 'lines', (s) => ({ ...s, typed: false }));
  expect(draft.project().design.lines).toEqual(original.lines);
  set(draft, 'glueVents', (s) => ({
    ...s,
    mode: 1,
    ribs: s.ribs.map((r, i) => (i === 0 ? { ...r, type: 5, parameters: [10, 20, 30] } : r)),
  }));
  let vents = draft.project().design.glueVents;
  if (vents.mode === 1) expect(vents.ribs[0].parameters).toEqual([10, 20, 30]);
  set(draft, 'glueVents', (s) => ({
    ...s,
    ribs: s.ribs.map((r, i) => (i === 0 ? { ...r, type: 4 } : r)),
  }));
  vents = draft.project().design.glueVents;
  if (vents.mode === 1) expect(vents.ribs[0].parameters).toEqual([10, 20]);
  expect(draft.value().glueVents.ribs[0].parameters[2]).toBe(30);
  set(draft, 'geometry', (s) => ({ ...s, ribColumns: 9 }));
  expect(draft.project().design.geometry.ribs[0]).not.toHaveProperty('rotZ');
  set(draft, 'geometry', (s) => ({ ...s, ribColumns: 11 }));
  expect(draft.project().design.geometry.ribs[0]).toHaveProperty('rotZ', 0);
});

test('HVR separation factors follow section 38 and retain edits while hidden', () => {
  const draft = new EditorDraft(fixture());
  set(draft, 'hvrPositions', (s) => ({
    ...s,
    coefficients: [
      { ...s.coefficients[0], horizontal: null },
      s.coefficients[1],
      s.coefficients[2],
      s.coefficients[3],
      s.coefficients[4],
      s.coefficients[5],
    ],
  }));
  expect(draft.project().design.hvrPositions).toEqual({ mode: 0 });
  set(draft, 'hvrHoles', (s) => ({ ...s, mode: 1 }));
  expect(draft.errors()).toContainEqual(
    expect.objectContaining({ field: 'hvrPositions.coefficients[0].horizontal' }),
  );
  set(draft, 'hvrHoles', (s) => ({ ...s, mode: 0 }));
  expect(draft.errors()).toEqual([]);
  expect(draft.value().hvrPositions.coefficients[0].horizontal).toBeNull();
});
