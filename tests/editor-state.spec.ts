import '@angular/compiler';
import {
  createEnvironmentInjector,
  Injector,
  provideZonelessChangeDetection,
  runInInjectionContext,
  ɵINJECTOR_SCOPE,
  type EnvironmentInjector,
} from '@angular/core';
import { expect, test } from '@playwright/test';
import type { Diagnostic, LepProject } from '../packages/format/src/index.ts';
import { parseLep } from '../packages/format/src/index.ts';
import { EditorDraft } from '../src/app/editor/editor-draft.ts';
import { writeProjectChanges } from '../src/app/inputs/write-project.ts';
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

// A root injector without an application or a DOM, for Signal Forms outside a
// component. Their services are `providedIn: 'root'`, so the injector needs the
// root scope; TestBed and createApplication need a DOM.
const injector = createEnvironmentInjector(
  [{ provide: ɵINJECTOR_SCOPE, useValue: 'root' }, provideZonelessChangeDetection()],
  // The null injector: an environment injector without providers.
  Injector.NULL as EnvironmentInjector,
);

function draftOf(project: LepProject, reading: readonly Diagnostic[] = []): EditorDraft {
  return runInInjectionContext(injector, () => new EditorDraft(project, reading));
}

test('editor state starts with the supplied project and a no-op save writes nothing', () => {
  const initial = fixture();
  const draft = draftOf(initial);
  expect(draft.project()).toEqual(initial);
  expect(draft.project().airfoils).toBe(initial.airfoils);
  expect(draft.diagnostics().filter((d) => d.severity === 'error')).toEqual([]);
  expect(draft.form().valid()).toBe(true);
  expect(draft.changed()).toBe(false);
  expect(writeProjectChanges(initial, draft.project())).toEqual({
    ok: true,
    value: [],
    warnings: [],
  });
});

test('unfinished numeric input stays verbatim and prevents Save', () => {
  const initial = fixture();
  const draft = draftOf(initial);
  const ribs = draft.form.sewingAllowances.ribs;
  for (const value of ['', '-', 'abc', 'Infinity', '0x10']) {
    ribs().value.set(value);
    expect(ribs().value()).toBe(value);
    expect(draft.form().invalid()).toBe(true);
    expect(ribs().errors()).toEqual([expect.objectContaining({ kind: 'format' })]);
    expect(draft.changed()).toBe(true);
    expect(draft.errors()).toContainEqual(
      expect.objectContaining({ section: 6, field: 'sewingAllowances.ribs' }),
    );
  }
  ribs().value.set('12.75');
  expect(draft.project().design.sewingAllowances.ribs).toBe(12.75);
  expect(draft.form().valid()).toBe(true);
  expect(ribs().errors()).toEqual([]);
  expect(initial.design.sewingAllowances.ribs).toBe(15);
});

test('DXF mode switches retain raw values but only the selected mode is emitted', () => {
  const draft = draftOf(fixture());
  const dxf2d = draft.form.dxf2d;
  expect(dxf2d.lineColors().value()).toEqual(['1', '30', '3', '4', '6', '5']);
  dxf2d().value.set({ mode: '1', lineColors: ['', '91', '92', '93', '94', '95'] });
  expect(draft.form().invalid()).toBe(true);
  dxf2d.mode().value.set('0');
  expect(draft.project().design.dxf2d).toEqual({ mode: 0 });
  expect(draft.form().valid()).toBe(true);
  dxf2d.mode().value.set('1');
  expect(dxf2d.lineColors[0]().value()).toBe('');
  expect(draft.form().invalid()).toBe(true);
  dxf2d().value.set({ mode: '1', lineColors: ['90', '91', '92', '93', '94', '95'] });
  expect(draft.project().design.dxf2d).toEqual({ mode: 1, lineColors: [90, 91, 92, 93, 94, 95] });
  dxf2d.lineColors[0]().value.set('1.5');
  expect(dxf2d.lineColors[0]().invalid()).toBe(true);
});

test('3D surfaces and colors survive mode switches, and only the design is rewritten', () => {
  const initial = fixture();
  const draft = draftOf(initial);
  const dxf3d = draft.form.dxf3d;
  expect(dxf3d.lineColors().value()).toEqual(['8', '8', '8', '8', '8', '30']);
  dxf3d().value.set({
    mode: '1',
    lineColors: ['21', '22', '23', '24', '25', '26'],
    surfaces: [
      { drawn: '1', color: '41' },
      { drawn: '0', color: '42' },
      { drawn: '1', color: '43' },
    ],
  });
  dxf3d.mode().value.set('0');
  expect(draft.project().design.dxf3d).toEqual({ mode: 0 });
  dxf3d.mode().value.set('1');
  expect(draft.project().design.dxf3d).toEqual({
    mode: 1,
    lineColors: [21, 22, 23, 24, 25, 26],
    surfaces: [
      { drawn: 1, color: 41 },
      { drawn: 0, color: 42 },
      { drawn: 1, color: 43 },
    ],
  });
  const files = ok(writeProjectChanges(initial, draft.project()));
  expect(files.map((f) => f.name)).toEqual(['leparagliding.txt']);
  expect(ok(parseLep(new TextDecoder().decode(files[0].bytes)))).toEqual(draft.project().design);
});

test('an equivalent number changes nothing', () => {
  const draft = draftOf(fixture());
  draft.form.sewingAllowances.ribs().value.set('15.0');
  expect(draft.changed()).toBe(false);
});

test('reading warnings remain nonblocking', () => {
  const warning = { severity: 'warning', file: 'gnua.txt', message: 'A reading warning' } as const;
  const draft = draftOf(fixture(), [warning]);
  expect(draft.form().valid()).toBe(true);
  expect(draft.diagnostics()).toContainEqual(warning);
});

test('a missing airfoil is shown but does not block Save', () => {
  const { design } = fixture();
  const draft = draftOf({ design, airfoils: new Map() });
  expect(draft.diagnostics()).toContainEqual(
    expect.objectContaining({ severity: 'error', section: 2 }),
  );
  expect(draft.errors()).toEqual([]);
  expect(draft.form().valid()).toBe(true);
});

test('a warning on an edited field does not invalidate it', () => {
  const draft = draftOf(fixture());
  draft.form.dxf2d.mode().value.set('1');
  draft.form.dxf2d.lineColors[0]().value.set('257');
  expect(draft.diagnostics()).toContainEqual(
    expect.objectContaining({ severity: 'warning', field: 'dxf2d.lineColors[0]' }),
  );
  expect(draft.form.dxf2d.lineColors[0]().valid()).toBe(true);
  expect(draft.form().valid()).toBe(true);
});

test('a design error outside the forms blocks Save, since writeLep refuses it', () => {
  const { design, airfoils } = fixture();
  const angleOfAttack = { ...design.angleOfAttack, linesLength: 0 };
  const draft = draftOf({ design: { ...design, angleOfAttack }, airfoils });
  expect(draft.errors()).toEqual([
    expect.objectContaining({ section: 8, field: 'angleOfAttack.linesLength' }),
  ]);
  expect(draft.form().invalid()).toBe(true);
});
