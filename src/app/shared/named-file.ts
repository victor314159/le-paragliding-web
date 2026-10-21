/** A file as raw bytes; the name may contain folders (`stl/wing.stl`). */
export interface NamedFile {
  name: string;
  bytes: ArrayBuffer;
}
