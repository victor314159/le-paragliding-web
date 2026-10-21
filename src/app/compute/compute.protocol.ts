// Messages between ComputeService and the compute Worker.
import type { NamedFile } from '../shared/named-file';

export type ComputeStatus = 'idle' | 'loading' | 'running' | 'done' | 'cancelled' | 'error';
export interface LogEntry {
  stream: 'stdout' | 'stderr';
  text: string;
}

export interface ComputeRequest {
  type: 'compute';
  assetsUrl: string;
  /** Complete input snapshot, preserving original bytes for unedited files. */
  files: NamedFile[];
}
export type ComputeEvent =
  | { type: 'phase'; phase: 'loading' | 'running' }
  | { type: 'memory'; wasmBytes: number }
  | { type: 'log'; entry: LogEntry }
  | { type: 'done'; files: NamedFile[]; computeMs: number }
  | { type: 'error'; message: string };
