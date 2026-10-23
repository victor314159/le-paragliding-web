import { DESIGN_FILE, writeLep, type LepProject, type Result } from '@lepara/format';
import { dequal } from 'dequal';
import type { NamedFile } from '../shared/named-file';

/** Rewrites leparagliding.txt only if the design changed: otherwise the files keep their bytes. */
export function writeProjectChanges(before: LepProject, after: LepProject): Result<NamedFile[]> {
  if (dequal(before.design, after.design)) return { ok: true, value: [], warnings: [] };
  const written = writeLep(after.design);
  if (!written.ok) return written;
  const bytes = new TextEncoder().encode(written.value).buffer;
  return { ok: true, value: [{ name: DESIGN_FILE, bytes }], warnings: written.warnings };
}
