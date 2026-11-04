import type { Point, Point3 } from './points.ts';

export type SkinProfileSections = 'geometry' | 'wingTip' | 'airfoils' | 'thickness';

/** A rib at the airfoil's own points, from 1 as in the engine (0 unused). */
export interface SkinRib {
  readonly chord: number;
  /** Its airfoil scaled to its chord (cm), in its plane. */
  readonly local: readonly Point[];
  /** Placed in 3D, at Wing scale. */
  readonly points: readonly Point3[];
  /** The last extrados point, where the air inlet starts. */
  readonly upper: number;
  /** The points of the air inlet. */
  readonly inlet: number;
}

export type SkinPatternSections =
  'geometry' | 'skinTension' | 'skinTensionGroups' | 'sewingAllowances' | 'glueVents';

/** A panel laid flat: its edges on its left and right ribs, by the engine's point indices. */
export interface Flat {
  left: Point[];
  right: Point[];
}

export type SkinSections = SkinProfileSections | SkinPatternSections | 'specialParameters';

/** A right-half panel of the engine's skin mesh, rows from its inner rib outwards. */
export interface BalloonedPanel {
  /** Outer rib index from 0; 0 is the central half cell, if any. */
  readonly cell: number;
  readonly surface: 'extrados' | 'intrados' | 'inlet';
  /** The airfoil point of the rows' first column. */
  readonly from: number;
  readonly rows: readonly (readonly {
    readonly point: Point3;
    readonly span: number;
    readonly chord: number;
  }[])[];
}

export interface SkinPatterns {
  /** Sewing lines (the engine's vectors 9 and 10). */
  readonly upper: readonly Flat[];
  readonly lower: readonly Flat[];
  readonly inlet: readonly Flat[];
  /** Cut lines along the ribs, sewing allowance included (vectors 11 and 12). */
  readonly seams: {
    readonly upper: readonly Flat[];
    readonly lower: readonly Flat[];
    readonly inlet: readonly Flat[];
  };
}
