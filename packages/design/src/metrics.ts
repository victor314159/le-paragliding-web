// Section 1 as the engine scales it: the spans, areas and aspect ratios of the wing.
import type { LepDesign } from '@lepara/format';
import { wingArea, type GeometryResult } from '@lepara/preprocessor';

/** Spans (m), areas (m²) and aspect ratios, flat and projected. */
export type WingMetrics = Pick<
  GeometryResult['metrics'],
  | 'flatSpan'
  | 'flatArea'
  | 'flatAspectRatio'
  | 'projectedSpan'
  | 'projectedArea'
  | 'projectedAspectRatio'
>;

/**
 * The main parameters that the engine writes in lep-out.txt, from the rib
 * table of section 1 at Wing scale, which it applies to its lengths; the
 * preprocessor gives them before it. None while a coordinate is missing or
 * an area is not positive.
 */
export function wingMetrics({ geometry }: Pick<LepDesign, 'geometry'>): WingMetrics | undefined {
  const { ribs, wingScale } = geometry;
  const tip = ribs.at(-1);
  if (
    !tip ||
    !Number.isFinite(wingScale) ||
    !ribs.every((r) => [r.x, r.xp, r.yLE, r.yTE].every(Number.isFinite))
  )
    return undefined;
  const flatSpan = (2 * tip.x * wingScale) / 100;
  const flatArea = wingArea(ribs, 'x') * wingScale ** 2;
  const projectedSpan = (2 * tip.xp * wingScale) / 100;
  const projectedArea = wingArea(ribs, 'xp') * wingScale ** 2;
  if (!(flatArea > 0 && projectedArea > 0)) return undefined;
  return {
    flatSpan,
    flatArea,
    flatAspectRatio: flatSpan ** 2 / flatArea,
    projectedSpan,
    projectedArea,
    projectedAspectRatio: projectedSpan ** 2 / projectedArea,
  };
}
