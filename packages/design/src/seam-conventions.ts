/**
 * How the pieces of a wing are sewn, which the design does not say: it only
 * gives the sewing allowances (section 6). The LEparagliding manual says no
 * more of folds or hems; these follow build guides, to check on a real wing.
 * Change a seam here; the previews follow. Every allowance stays inside the
 * wing.
 */

/** The layers of a rib's seam, from the wing's centre to its tip: panels, rib and its turned edge. */
export type RibSeamLayer = 'innerPanel' | 'rib' | 'ribFlap' | 'outerPanel';

/**
 * How the allowance across a panel's end lies: `hem` turned back under its
 * panel; `towardTrailingEdge` pressed that way, turned on the piece ahead of
 * the trailing edge's side and straight on the other.
 */
export type EndSeam = 'hem' | 'towardTrailingEdge';

export const SEAM_CONVENTIONS = {
  /**
   * A rib sandwiched between the panels of its two cells, three layers
   * sewn at the same time (manual, section 5): the panels' allowances lie
   * along the rib, each in its own cell, and the rib's edge turns back onto
   * it, tipwards.
   */
  rib: ['innerPanel', 'rib', 'ribFlap', 'outerPanel'] as const satisfies readonly RibSeamLayer[],
  /** The leading edge, its inlets included, hemmed into the inside. */
  leadingEdge: 'hem' as EndSeam,
  /** Practices vary: some builders roll it, some trim it. A hem, to check on a wing. */
  trailingEdge: 'hem' as EndSeam,
  /** The seams of the 3D-shaping cuts. */
  shaping: 'towardTrailingEdge' as EndSeam,
  /** The thickness of a layer as drawn (cm), far above the fabric's, to tell layers apart. */
  layerThickness: 0.1,
  /** How far two edges sewn together may differ in length, or their marks lie apart (cm). */
  seamTolerance: 0.2,
};
