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

test('a design error outside the forms blocks Save, since writeLep refuses it', () => {
  const { design, airfoils } = fixture();
  const angleOfAttack = { ...design.angleOfAttack, linesLength: 0 };
  const draft = new EditorDraft({ design: { ...design, angleOfAttack }, airfoils });
  expect(draft.errors()).toEqual([
    expect.objectContaining({ section: 8, field: 'angleOfAttack.linesLength' }),
  ]);
});
