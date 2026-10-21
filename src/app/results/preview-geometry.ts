export interface PreviewLabel {
  position: [number, number, number];
  text: string;
  height: number;
  rotation: number;
  color: number;
}

export interface PreviewDrawing {
  positions: Float32Array;
  colors: Float32Array;
  labels: PreviewLabel[];
  skipped: number;
}

/** A DXF to parse, with the theme colors for its default and white elements. */
export interface PreviewDrawingRequest {
  url: string;
  ink: number;
  accent: number;
}

export type PreviewDrawingResult = { drawing: PreviewDrawing } | { error: string };
