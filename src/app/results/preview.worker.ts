/// <reference lib="webworker" />

import { DxfFetcher } from 'dxf-viewer';
import type { PreviewDrawingRequest, PreviewDrawingResult, PreviewLabel } from './preview-geometry';

// DxfFetcher exposes an untyped document. Keep its geometry model at this
// boundary; the UI receives only our typed, transferable drawing data.
interface IPoint {
  x: number;
  y: number;
  z?: number;
}
interface ILineEntity {
  vertices: IPoint[];
  shape?: boolean;
}
interface ICircleEntity {
  center: IPoint;
  radius: number;
  startAngle?: number;
  endAngle?: number;
}
interface ITextEntity {
  startPoint: IPoint;
  textHeight: number;
  text: string;
  rotation?: number;
}
interface DxfDocument {
  entities: ({ type: string; layer: string; visible?: boolean; color?: number } & Partial<
    ILineEntity & ICircleEntity & ITextEntity
  >)[];
  tables?: { layer?: { layers?: Record<string, { visible?: boolean; color?: number }> } };
}

// Parsing multi-megabyte DXFs stays outside the UI thread. Closing the dialog
// terminates this worker, including a parse that is still in progress.
addEventListener('message', ({ data }: MessageEvent<PreviewDrawingRequest>) => {
  void load(data);
});

async function load({ url, ink, accent }: PreviewDrawingRequest): Promise<void> {
  try {
    const document: unknown = await new DxfFetcher(url).Fetch();
    const dxf = document as DxfDocument;
    const positions: number[] = [];
    const colors: number[] = [];
    const labels: PreviewLabel[] = [];
    let skipped = 0;
    const valid = (point: IPoint): boolean =>
      [point.x, point.y, point.z ?? 0].every(Number.isFinite);
    const segment = (a: IPoint, b: IPoint, color: number): void => {
      if (!valid(a) || !valid(b)) {
        skipped++;
        return;
      }
      positions.push(a.x, a.y, a.z ?? 0, b.x, b.y, b.z ?? 0);
      for (let i = 0; i < 2; i++)
        colors.push(((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255);
    };
    for (const entity of dxf.entities) {
      const layer = dxf.tables?.layer?.layers?.[entity.layer];
      if (entity.visible === false || layer?.visible === false) continue;
      // White (ACI 7) is the drawing ink, which must contrast with the theme.
      const original = entity.color ?? layer?.color ?? accent;
      const color = original === 0xffffff ? ink : original;
      switch (entity.type) {
        case 'LINE':
        case 'POLYLINE':
        case 'LWPOLYLINE':
        case '3DFACE': {
          const line = entity as ILineEntity;
          for (let i = 1; i < line.vertices.length; i++)
            segment(line.vertices[i - 1], line.vertices[i], color);
          if ((line.shape || entity.type === '3DFACE') && line.vertices.length > 2)
            segment(line.vertices.at(-1)!, line.vertices[0], color);
          break;
        }
        case 'CIRCLE':
        case 'ARC': {
          const circle = entity as ICircleEntity;
          const start = circle.startAngle ?? 0;
          let sweep =
            entity.type === 'CIRCLE' ? 2 * Math.PI : (circle.endAngle ?? 2 * Math.PI) - start;
          if (sweep <= 0) sweep += 2 * Math.PI;
          const point = (angle: number): IPoint => ({
            x: circle.center.x + circle.radius * Math.cos(angle),
            y: circle.center.y + circle.radius * Math.sin(angle),
            z: circle.center.z ?? 0,
          });
          for (let i = 0; i < 64; i++)
            segment(point(start + (sweep * i) / 64), point(start + (sweep * (i + 1)) / 64), color);
          break;
        }
        case 'TEXT': {
          const text = entity as ITextEntity;
          if (!valid(text.startPoint) || !Number.isFinite(text.textHeight)) {
            skipped++;
            break;
          }
          labels.push({
            position: [text.startPoint.x, text.startPoint.y, text.startPoint.z ?? 0],
            text: text.text,
            height: text.textHeight,
            rotation: ((text.rotation ?? 0) * Math.PI) / 180,
            color,
          });
          break;
        }
        default:
          skipped++;
      }
    }
    const drawing = {
      positions: new Float32Array(positions),
      colors: new Float32Array(colors),
      labels,
      skipped,
    };
    postMessage({ drawing } satisfies PreviewDrawingResult, [
      drawing.positions.buffer,
      drawing.colors.buffer,
    ]);
  } catch (error: unknown) {
    postMessage({
      error: error instanceof Error ? error.message : String(error),
    } satisfies PreviewDrawingResult);
  }
}
