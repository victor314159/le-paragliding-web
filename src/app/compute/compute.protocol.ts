// States and log lines of a calculation (ComputeService).
export type ComputeStatus = 'idle' | 'loading' | 'running' | 'done' | 'cancelled' | 'error';
export interface LogEntry {
  stream: 'stdout' | 'stderr';
  text: string;
}
