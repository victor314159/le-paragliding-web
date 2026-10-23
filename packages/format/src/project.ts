import { parseAirfoil, type LepAirfoil } from './airfoil.ts';
import { DESIGN_FILE, parseLep } from './read-design.ts';
import type { Diagnostic } from './result.ts';
import { validate, type LepProject } from './validate.ts';

/** A project read from its files. */
export interface ProjectReading {
  /** Absent when leparagliding.txt is missing or unreadable. */
  readonly project?: LepProject;
  /** The diagnostics of reading the files: `validate` takes them for a changed project. */
  readonly reading: readonly Diagnostic[];
  /** Those of reading, then those of validating the project. */
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Reads the files the engine reads, by exact name: leparagliding.txt and the
 * airfoils it names. The engine ignores the other files: they are not read.
 */
export function readProject(files: ReadonlyMap<string, string>): ProjectReading {
  const main = files.get(DESIGN_FILE);
  if (main === undefined) {
    const reading: Diagnostic[] = [
      { severity: 'error', file: DESIGN_FILE, message: `Missing input file ${DESIGN_FILE}` },
    ];
    return { reading, diagnostics: reading };
  }
  const parsed = parseLep(main);
  if (!parsed.ok) return { reading: parsed.errors, diagnostics: parsed.errors };
  const reading = [...parsed.warnings];
  const airfoils = new Map<string, LepAirfoil>();
  for (const name of new Set(parsed.value.airfoils.map((row) => row.airfoil))) {
    const text = files.get(name);
    // validate reports the missing airfoils.
    if (text === undefined) continue;
    const result = parseAirfoil(name, text);
    if (result.ok) airfoils.set(name, result.value);
    reading.push(...(result.ok ? result.warnings : result.errors));
  }
  const project = { design: parsed.value, airfoils };
  return { project, reading, diagnostics: validate(project, { reading }) };
}
