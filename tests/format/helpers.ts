import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type * as Engine from '../../packages/engine/src/node.ts';
import designIndex from '../../oracle/designs/index.json' with { type: 'json' };
import {
  parseAirfoil,
  parseLep,
  type LepAirfoil,
  type LepDesign,
  type LepProject,
  type Result,
} from '../../packages/format/src/index.ts';

export const DESIGNS = designIndex.map((design) => design.id);
export const DAT_FIXTURE = 'tests/format/fixtures/dat-airfoil';

// build/engine/ (scripts/assemble-engine.sh), or its copy in the release
// build dist/engine/ where it was not assembled (CI).
const ENGINE = ['build/engine/node.js', 'dist/engine/node.js'].find((path) => existsSync(path));
export const engine = () => {
  if (!ENGINE) {
    throw new Error(
      'No engine: run scripts/assemble-engine.sh (build/engine/) or docker build --output dist .',
    );
  }
  return import(pathToFileURL(resolve(ENGINE)).href) as Promise<typeof Engine>;
};

/** The files of a design directory, by name. */
export function designFiles(dir: string): Map<string, string> {
  return new Map(readdirSync(dir).map((name) => [name, readFileSync(join(dir, name), 'utf8')]));
}

export function ok<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.errors, null, 2));
  return result.value;
}

/** A design directory, or its `files`, read into a project. */
export function project(dir: string, files = designFiles(dir)): LepProject {
  const airfoils = new Map<string, LepAirfoil>();
  let design: LepDesign | undefined;
  for (const [name, text] of files) {
    if (name === 'leparagliding.txt') design = ok(parseLep(text));
    else airfoils.set(name, ok(parseAirfoil(name, text)));
  }
  if (!design) throw new Error(`No leparagliding.txt in ${dir}`);
  return { design, airfoils };
}

const header = (n: number, ...more: string[]) => [
  '*******************************',
  `*   ${n}. SECTION ${n}`,
  '*******************************',
  ...more,
];

/**
 * A small hand-written design: 2 cells (2 ribs in the half wing), one line
 * plan, every optional section at 0. `sections` replaces whole sections
 * (header lines included), `section(n, …)` building their headers.
 */
export function lep(sections: Record<number, readonly string[]> = {}): string {
  const defaults: Record<number, readonly string[]> = {
    1: [
      '*******************************',
      '* LABORATORI D ENVOL',
      '* Input data file 3.29',
      '*******************************',
      '* test',
      '*******************************',
      '*   1. GEOMETRY',
      '*******************************',
      '* Brand name',
      '"Brand"',
      '* Wing name',
      '"Wing"',
      '* Drawing scale',
      '1.',
      '* Wing scale',
      '1.',
      '* Number of cells',
      '2',
      '* Number of ribs',
      '3',
      '* Alpha max and parameter',
      '2.5 1',
      '* Paraglider type and parameter',
      '"ds" 1',
      '* Rib geometric parameters',
      '* Rib x-rib y-LE y-TE xp z beta RP Washin z_rot z_pos',
      '1  0.    0.  250.  0.   0.  0.   33.33 0. 0. 50.',
      '2  100.  10. 240.  99.  5.  10.  33.33 0. 0. 50.',
    ],
    2: [
      ...header(2, '* Rib airfoil in out open disp rw rrw'),
      '1 gnua.txt 1.6 6.3 1 0 1 15',
      '2 gnua.txt 1.6 6.3 1 0 1 15',
    ],
    3: [
      ...header(3, '* Rib anchors A B C D E F'),
      '1 4 8.5 27.5 53 77 0 0',
      '2 4 8.5 27.5 53 77 0 100',
    ],
    4: [...header(4), '0'],
    5: [
      ...header(5, 'Extrados'),
      '0. 0. 0. 0.',
      '7.5 1.3 10. 1.33',
      '15. 2.5 20. 2.5',
      '80. 2.5 80. 2.5',
      '90. 1.33 90. 1.33',
      '100. 0. 100. 0.',
      '0.0114',
      '1000 1.0',
    ],
    6: [
      ...header(6),
      '15 25 20 upper panels (mm)',
      '15 25 20 lower panels (mm)',
      '15 ribs (mm)',
      '15 vribs (mm)',
    ],
    7: [...header(7), '25. 0.5 0.15'],
    8: [
      ...header(8, '* Finesse GR'),
      '7.0',
      '* Plumb point',
      '32.9',
      '* Calage',
      '33.0',
      '* Risers',
      '47',
      '* Lines',
      '650',
      '* Karabiners',
      '40',
    ],
    9: [...header(9), '3', '1', '1', '2 1 1 2 1 0 0 0 0 1 1'],
    10: [
      ...header(10),
      '270',
      '1',
      '2 1 1 2 1 0 0 0 0 6 1.5',
      '* Brake distribution',
      '0 25 55 70 100',
      '0 0 0 0 0',
    ],
    11: [...header(11), '3 150', '4 300 150', '3 100', '4 200 80'],
    12: [...header(12), '0', '80 180'],
    15: [...header(15), '0'],
    16: [...header(16), '0'],
    17: [...header(17), '0'],
    18: [
      ...header(18),
      '100',
      '75 25',
      '40 40 20',
      '35 35 20 10',
      '35 35 15 10 5',
      '1 0.08 0.2 0.2',
      '2 0.08 0.2 0.2',
      '3 0.08 0.2 0.2',
      '4 0.08 0.2 0.2',
      '5 0.08 0.2 0.2',
    ],
    19: [...header(19), '1', 'general default'],
    // The engine uses mark types 1 to 10.
    20: [
      ...header(20),
      '10',
      ...Array.from({ length: 10 }, (_, i) => `type${i + 1} 1 0.25 1.2 2 0.3 1.2`),
    ],
  };
  for (let n = 21; n <= 39; n++) defaults[n] = [...header(n), '0'];
  const all = { ...defaults, ...sections };
  return (
    Object.keys(all)
      .map(Number)
      .sort((a, b) => a - b)
      .flatMap((n) => all[n])
      .join('\n') + '\n'
  );
}

/** A section: its 3 header lines, then `lines`. */
export const section = (n: number, ...lines: string[]) => [...header(n), ...lines];
