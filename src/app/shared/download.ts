import type { NamedFile } from './named-file';

/** Saves a Blob through the browser's download flow. */
export function saveFile(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  // Some browsers read the URL after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Saves files as one ZIP archive; names may contain folders. */
export async function saveZip(name: string, files: readonly NamedFile[]): Promise<void> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const file of files) zip.file(file.name, file.bytes);
  saveFile(name, await zip.generateAsync({ type: 'blob' }));
}
