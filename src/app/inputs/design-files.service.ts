import { computed, Injectable, signal } from '@angular/core';
import { saveFile, saveZip } from '../shared/download';
import type { NamedFile } from '../shared/named-file';
import { DESIGNS } from './designs';

export const MAIN_FILE = 'leparagliding.txt';

export interface InputFile extends NamedFile {
  original: ArrayBuffer;
  imported: boolean;
  modified: boolean;
}

function sameBytes(a: ArrayBuffer, b: ArrayBuffer): boolean {
  if (a === b) return true;
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** The editable input files of the selected design, with drafts per source. */
@Injectable({ providedIn: 'root' })
export class DesignFilesService {
  readonly sourceId = signal(DESIGNS[0].id);
  readonly selected = computed(() => DESIGNS.find((design) => design.id === this.sourceId()));
  readonly files = signal<InputFile[]>([]);
  readonly loading = signal(false);
  readonly importing = signal(false);
  readonly zipping = signal(false);
  readonly error = signal('');
  readonly pending = computed(() => this.loading() || this.importing());
  readonly missing = computed(() => {
    if (!this.files().length) return [];
    const main = this.files().find((file) => file.name === MAIN_FILE);
    if (!main) return [MAIN_FILE];
    // The engine accepts .txt and .dat profiles, named in numbered airfoil rows.
    const names = [
      ...this.text(main).matchAll(
        /^\s*\d+[\s,]+(?:"([^"\r\n]+\.(?:txt|dat))"|'([^'\r\n]+\.(?:txt|dat))'|([^\s,'"]+\.(?:txt|dat)))(?=[\s,]|$)/gim,
      ),
    ].map((match) => match[1] ?? match[2] ?? match[3]);
    const available = new Set(this.files().map((file) => file.name));
    return [...new Set(names)].filter((name) => !available.has(name));
  });
  readonly ready = computed(
    () => !this.pending() && this.files().length > 0 && !this.missing().length,
  );
  // Drafts last for this page session and stay separate for each source.
  private readonly drafts = new Map<string, InputFile[]>();

  async selectSource(id: string, reload = false): Promise<void> {
    if (this.pending()) return;
    this.drafts.set(this.sourceId(), this.files());
    this.sourceId.set(id);
    this.error.set('');
    const cached = this.drafts.get(id);
    if (!reload && cached?.length) {
      this.files.set(cached);
      return;
    }
    const design = this.selected();
    this.files.set([]);
    if (!design) return;
    this.loading.set(true);
    try {
      const files = await Promise.all(
        [MAIN_FILE, ...design.airfoils].map(async (name) => {
          const response = await fetch(new URL(`examples/${design.id}/${name}`, document.baseURI));
          if (!response.ok) throw new Error(`Could not load ${name} (HTTP ${response.status}).`);
          const bytes = await response.arrayBuffer();
          return { name, bytes, original: bytes, imported: false, modified: false };
        }),
      );
      this.files.set(files);
    } catch (error: unknown) {
      this.error.set(errorMessage(error, 'Could not load the input files.'));
    } finally {
      this.loading.set(false);
    }
  }

  text(file: NamedFile): string {
    return new TextDecoder().decode(file.bytes);
  }

  edit(file: InputFile, text: string): void {
    this.replace(file.name, new TextEncoder().encode(text).buffer);
  }

  restore(file: InputFile): void {
    this.replace(file.name, file.original);
  }

  remove(file: InputFile): void {
    this.files.update((files) => files.filter((candidate) => candidate.name !== file.name));
  }

  async importFiles(localFiles: File[], replaceName?: string): Promise<void> {
    if (!localFiles.length || this.pending()) return;
    this.importing.set(true);
    this.error.set('');
    try {
      const incoming: NamedFile[] = [];
      for (const local of localFiles) {
        if (!replaceName && /\.zip$/i.test(local.name)) {
          const { default: JSZip } = await import('jszip');
          const zip = await JSZip.loadAsync(await local.arrayBuffer());
          for (const entry of Object.values(zip.files)) {
            if (!entry.dir)
              incoming.push({ name: entry.name, bytes: await entry.async('arraybuffer') });
          }
        } else {
          incoming.push({ name: replaceName ?? local.name, bytes: await local.arrayBuffer() });
        }
      }
      if (!incoming.length) throw new Error('The archive contains no input files.');
      const invalid = incoming.find(
        (file) => /[\\/\0]/.test(file.name) || !/\.(txt|dat)$/i.test(file.name),
      );
      if (invalid) throw new Error(`Use .txt or .dat files without folders: ${invalid.name}`);
      if (new Set(incoming.map((file) => file.name)).size !== incoming.length)
        throw new Error(
          'Several imported files have the same name. Import one version of each file.',
        );
      for (const file of incoming) {
        if (this.files().some((candidate) => candidate.name === file.name))
          this.replace(file.name, file.bytes);
        else
          this.files.update((files) => [
            ...files,
            { ...file, original: file.bytes, imported: true, modified: false },
          ]);
      }
    } catch (error: unknown) {
      this.error.set(errorMessage(error, 'Could not import the files.'));
    } finally {
      this.importing.set(false);
    }
  }

  exportFile(file: InputFile): void {
    saveFile(file.name, new Blob([file.bytes], { type: 'text/plain' }));
  }

  async exportAll(): Promise<void> {
    if (this.zipping()) return;
    this.zipping.set(true);
    try {
      await saveZip('lepara-inputs.zip', this.files());
    } catch (error: unknown) {
      this.error.set(errorMessage(error, 'Could not export the input files.'));
    } finally {
      this.zipping.set(false);
    }
  }

  private replace(name: string, bytes: ArrayBuffer): void {
    this.files.update((files) =>
      files.map((file) =>
        file.name === name ? { ...file, bytes, modified: !sameBytes(bytes, file.original) } : file,
      ),
    );
  }
}
