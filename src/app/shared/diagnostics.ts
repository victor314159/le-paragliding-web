import type { Diagnostic } from '@lepara/format';

export function withSeverity(
  diagnostics: readonly Diagnostic[],
  severity: Diagnostic['severity'],
): Diagnostic[] {
  return diagnostics.filter((diagnostic) => diagnostic.severity === severity);
}

export function diagnosticLabel(diagnostic: Diagnostic): string {
  const location = [
    diagnostic.file,
    diagnostic.section === undefined ? '' : `Section ${diagnostic.section}`,
    diagnostic.field,
    diagnostic.line === undefined ? '' : `line ${diagnostic.line}`,
  ].filter(Boolean);
  return `${location.join(' · ')}: ${diagnostic.message}`;
}
