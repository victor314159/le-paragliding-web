// The content of leparagliding.txt (LEparagliding 3.29), as the engine
// reads it: values as written in the file, before the engine scales or
// converts them. Each field names the Fortran variable it fills; meanings
// and units come from the LEparagliding 3.29 manual
// (https://www.laboratoridenvol.com/leparagliding/manual.en.html) and the
// 3.29 update notes.
//
// Types: "integer" fields hold integers (the engine reads them as INTEGER),
// the other numbers are REAL*8, and strings are CHARACTER*n (n bytes,
// trailing blanks dropped). Lengths are in cm at wing scale 1 unless noted
// (the engine multiplies them by `wingScale`).
//
// Labels the engine reads but never uses (the first word of `label value`
// lines, units after values) are not part of the model: writeLep writes
// standard ones.

/** A design: the 37 sections of leparagliding.txt (there are no sections 13 and 14). */
export interface LepDesign {
  /** 1. Geometry. */
  readonly geometry: Geometry;
  /** 2. Airfoils, one row per rib of the half wing. */
  readonly airfoils: readonly AirfoilRow[];
  /** 3. Anchor points, one row per rib of the half wing. */
  readonly anchors: readonly AnchorRow[];
  /** 4. Lightening holes, by groups of ribs (`ndis` groups). */
  readonly holes: readonly HoleGroup[];
  /** 5. Skin tension. */
  readonly skinTension: SkinTension;
  /** 6. Sewing allowances (mm). */
  readonly sewingAllowances: SewingAllowances;
  /** 7. Sewing marks. */
  readonly marks: Marks;
  /** 8. Global angle of attack estimation. */
  readonly angleOfAttack: AngleOfAttack;
  /** 9. Suspension lines. */
  readonly lines: Lines;
  /** 10. Brakes. */
  readonly brakes: Brakes;
  /** 11. Ramification lengths. */
  readonly ramifications: Ramifications;
  /** 12. H, V and VH ribs. */
  readonly hvRibs: HvRibs;
  /** 15. Extrados colors. */
  readonly extradosColors: Colors;
  /** 16. Intrados colors. */
  readonly intradosColors: Colors;
  /** 17. Additional rib points (`narp` points, at most 10). */
  readonly ribPoints: readonly RibPoint[];
  /** 18. Elastic lines corrections. */
  readonly elasticLines: ElasticLines;
  /**
   * 19. DXF layer names (`k19d` names, at most 50), `lyname(i)`. Read, but
   * not used by 3.29.
   */
  readonly dxfLayers: readonly string[];
  /** 20. Marks types (`k20d` rows: 3.29 uses the first 10). */
  readonly markTypes: readonly MarkType[];
  /** 21. Nylon rods (joncs). */
  readonly joncs: Joncs;
  /** 22. Nose mylars. */
  readonly noseMylars: NoseMylars;
  /** 23. Tab reinforcements. */
  readonly tabReinforcements: TabReinforcements;
  /** 24. General 2D DXF options. */
  readonly dxf2d: Dxf2d;
  /** 25. General 3D DXF options. */
  readonly dxf3d: Dxf3d;
  /** 26. Glue vents. */
  readonly glueVents: GlueVents;
  /** 27. Special wing tip. */
  readonly wingTip: WingTip;
  /** 28. Calage variation study. */
  readonly calageVariation: CalageVariation;
  /** 29. 3D shaping. */
  readonly shaping: Shaping;
  /** 30. Airfoil thickness modification. */
  readonly thickness: Thickness;
  /** 31. New skin tension module. */
  readonly skinTensionGroups: SkinTensionGroups;
  /** 32. Parameters for parts separation. */
  readonly partsSeparation: PartsSeparation;
  /** 33. Detailed risers. */
  readonly risers: Risers;
  /** 34. Lines characteristics table. */
  readonly lineTypes: LineTypes;
  /** 35. Solve equilibrium equations. */
  readonly equilibrium: Equilibrium;
  /** 36. Files for XFLR5 analysis. */
  readonly xflr5: Xflr5;
  /** 37. Special parameters. */
  readonly specialParameters: SpecialParameters;
  /** 38. HVR holes. */
  readonly hvrHoles: HvrHoles;
  /** 39. HVR position parameters. */
  readonly hvrPositions: HvrPositions;
}

// --- 1. Geometry ------------------------------------------------------------

export interface Geometry {
  /** `bname`, CHARACTER*50 (UTF-8 allowed since 3.29). */
  readonly brandName: string;
  /** `wname`, CHARACTER*50. Also names the .xwimp file of section 36. */
  readonly wingName: string;
  /** Scale of the 2D plans, `xkf` (usually 1). */
  readonly drawingScale: number;
  /** Scale applied to the lengths of the wing, `xwf` (usually 1). */
  readonly wingScale: number;
  /** Number of cells, `ncells` (integer). The half wing has `int(cells/2)+1` ribs. */
  readonly cells: number;
  /** Number of ribs, `nribst` (integer). */
  readonly ribCount: number;
  /** Washin method and angles: `alpham`, `kbbb`, `alphac`. */
  readonly washin: Washin;
  /** Paraglider type, `atp` (CHARACTER*2): "ds" double skin, "ss" single skin, "pc" parachute, "sk". */
  readonly paragliderType: string;
  /**
   * `kaaa` (integer, 0 or 1). For single-skin wings, whether the leading
   * edge triangles rotate.
   */
  readonly paragliderParameter: number;
  /**
   * Columns of the rib table: 11 since LEparagliding 3.16 (with `rotZ` and
   * `rotZPosition`), 9 before. The engine counts the words of the first row.
   */
  readonly ribColumns: 9 | 11;
  /** Rib geometry, one row per rib of the half wing, from the center. */
  readonly ribs: readonly RibGeometry[];
}

/** `alpham kbbb [alphac]`. */
export type Washin =
  /** Manual: each rib's washin is its `washin` column. `alpham` is read but unused. */
  | { readonly mode: 0; readonly maxAngle: number }
  /** Linear with the chord, from 0 at the center to `maxAngle` (deg) at the tip. */
  | { readonly mode: 1; readonly maxAngle: number }
  /** Linear with the chord, from `centerAngle` at the center to `maxAngle` at the tip (deg). */
  | { readonly mode: 2; readonly maxAngle: number; readonly centerAngle: number };

export interface RibGeometry {
  /** Rib number, `rib(i,1)`. */
  readonly number: number;
  /** x of the rib in the planform, `rib(i,2)`. */
  readonly x: number;
  /** y of the leading edge, `rib(i,3)`. */
  readonly yLE: number;
  /** y of the trailing edge, `rib(i,4)`. */
  readonly yTE: number;
  /** Final x' of the rib in the 3D wing, `rib(i,6)`. */
  readonly xp: number;
  /** Final z of the rib, `rib(i,7)`. */
  readonly z: number;
  /** Rib angle to the vertical, beta (deg), `rib(i,9)`. */
  readonly beta: number;
  /** Rotation point of the washin (% of chord), `rib(i,10)`. */
  readonly rotationPoint: number;
  /** Manual washin (deg), `rib(i,51)`: used in washin mode 0. */
  readonly washin: number;
  /** Rotation around the z axis (deg), `rib(i,250)`: 11-column tables only. */
  readonly rotZ?: number;
  /** Position of that vertical axis (% of chord), `rib(i,251)`: 11-column tables only. */
  readonly rotZPosition?: number;
}

// --- 2. Airfoils, 3. Anchor points --------------------------------------------

export interface AirfoilRow {
  /** Rib number, `rib(i,1)`. */
  readonly number: number;
  /**
   * Airfoil file, `nomair(i)` (CHARACTER*50). Its last three characters,
   * "txt" or "dat", select its format.
   */
  readonly airfoil: string;
  /** Air inlet start (% of chord), `rib(i,11)`. */
  readonly intakeStart: number;
  /** Air inlet end (% of chord), `rib(i,12)`. */
  readonly intakeEnd: number;
  /** Cell to the left of the rib: 1 open, 0 closed, `rib(i,14)`. */
  readonly open: number;
  /** Displacement of the rib, perpendicular to its chord in its plane, `rib(i,50)`. */
  readonly displacement: number;
  /** Relative chord weight (usually 1), `rib(i,55)`. */
  readonly relativeWeight: number;
  /**
   * `rib(i,56)`: above 1, the length of a minirib (% of chord); in
   * single-skin wings, 0 or 1 sets the rotation of the triangles.
   */
  readonly minirib: number;
}

export interface AnchorRow {
  /** Rib number, `rib(i,1)`. */
  readonly number: number;
  /** Number of anchors of the rib, A to E, `rib(i,15)`. */
  readonly count: number;
  /** Positions of the anchors A to E and of the brake F (% of chord), `rib(i,16..21)`. */
  readonly positions: readonly [number, number, number, number, number, number];
}

// --- 4. Holes -------------------------------------------------------------------

export interface HoleGroup {
  /** First rib of the group, `nrib1` (integer). */
  readonly firstRib: number;
  /** Last rib of the group, `nrib2` (integer). */
  readonly lastRib: number;
  /** Holes of each rib of the group (`nhols`, at most 200). */
  readonly holes: readonly Hole[];
}

export interface Hole {
  /** Hole type, `hol(i,l,9)`: 1 ellipse, 2 ellipse with a strip, 3 triangle, 4 rectangle. */
  readonly type: number;
  /**
   * `hol(i,l,2..8)`, % of chord unless noted. Type 1: distance from the
   * leading edge, distance from the chord line, horizontal and vertical
   * axes, rotation, then unused. Type 3: distance from the leading edge,
   * distance of the corner from the chord, base, height, rotation, corner
   * radius, unused. Type 4: x and y of the corner, width, height, rotation
   * (deg), corner radius, unused.
   */
  readonly parameters: readonly [number, number, number, number, number, number, number];
}

// --- 5 to 8 -------------------------------------------------------------------

export interface SkinTension {
  /** Six points of the overwidth, `skin(k,1..4)`, interpolated linearly. */
  readonly points: readonly [
    SkinTensionPoint,
    SkinTensionPoint,
    SkinTensionPoint,
    SkinTensionPoint,
    SkinTensionPoint,
    SkinTensionPoint,
  ];
  /** Strain in miniribs, `htens` (default 0.0114). */
  readonly miniribStrain: number;
  /**
   * Panel reformatting, `ndif` (integer) and `xndif`: 1000 and 1.0 for the
   * full precision method; other values select the older sewing correction
   * on `ndif` points, a factor of 0 disabling it.
   */
  readonly panelCorrection: { readonly points: number; readonly factor: number };
}

/** An overwidth point: positions (% of chord) and overwidths (% of chord). */
export interface SkinTensionPoint {
  readonly extradosPosition: number;
  readonly extradosOverwidth: number;
  readonly intradosPosition: number;
  readonly intradosOverwidth: number;
}

export interface SewingAllowances {
  /** Upper panels: `xupp`, `xupple`, `xuppte`. */
  readonly upper: PanelAllowances;
  /** Lower panels: `xlow`, `xlowle`, `xlowte`. */
  readonly lower: PanelAllowances;
  /** Rib edges, `xrib`. */
  readonly ribs: number;
  /** V-rib edges, `xvrib`. */
  readonly vRibs: number;
}

export interface PanelAllowances {
  readonly sides: number;
  readonly leadingEdge: number;
  readonly trailingEdge: number;
}

export interface Marks {
  /** Spacing of the sewing marks (cm), `xmark`. */
  readonly spacing: number;
  /** Radius of the mark points, `xcir`. */
  readonly pointRadius: number;
  /** Offset of the mark points, `xdes`. */
  readonly pointOffset: number;
}

export interface AngleOfAttack {
  /** Glide ratio goal, `finesse`. */
  readonly glideRatio: number;
  /** Center of pressure (% of the central chord), `cpress`. */
  readonly centerOfPressure: number;
  /** Calage (% of chord, from the leading edge to the pilot's vertical), `calage`. */
  readonly calage: number;
  /** Basic risers length, `clengr`. */
  readonly risersLength: number;
  /** Basic lines length, from the quick links to the sail, `clengl`. */
  readonly linesLength: number;
  /** Separation of the main karabiners, `clengk`. */
  readonly karabinerSeparation: number;
}

// --- 9. Lines, 10. Brakes, 11. Ramifications ------------------------------------

export interface Lines {
  /**
   * `zcontrol`: how the lower branches are placed. 0 at the geometric mean
   * of their anchor points, 1 and 2 weighted, 3 optimized spanwise and
   * chordwise.
   */
  readonly weighting: number;
  /**
   * Rows carry line types (`icase_lines` = 1): the engine checks whether the
   * first row has more than 11 words. Rows without types have 11 values.
   */
  readonly typed: boolean;
  /** Line plans, one per riser (`slp`, at most 9), brakes excluded. */
  readonly plans: readonly LinePlan[];
}

export interface LinePlan {
  /** Paths of the plan (`cam(ii)`, at most 100). */
  readonly paths: readonly LinePath[];
}

/** A path `mc(ii,i,k)` from the riser to an anchor (all integers). */
export interface LinePath {
  /** Number of branching levels, `mc(ii,i,1)`: 1 to 4 (5 reads two more columns, unused by 3.29). */
  readonly levels: number;
  /**
   * Level and order of the line at each level, `mc(ii,i,2..9)`: four pairs
   * (level 1 to 4, then 0 0), five with 5 levels (`mc(ii,i,10..11)`).
   */
  readonly branches: readonly Branch[];
  /** Anchor row: 1 = A, 2 = B, 3 = C, 4 = D, 5 = E, 6 = F (brake), `mc(ii,i,14)`. */
  readonly anchorRow: number;
  /** Anchor rib, `mc(ii,i,15)`. */
  readonly anchorRib: number;
  /** Line type of each level (table of section 34), `mc(ii,i,31..)`: typed rows only. */
  readonly lineTypes?: readonly number[];
}

export type Branch = readonly [level: number, order: number];

export interface Brakes {
  /** Main brake line length, `clengb`. */
  readonly length: number;
  /** Rows carry line types (`icase_brakes` = 1), as in section 9. */
  readonly typed: boolean;
  /** Brake paths (`cam(slp+1)`, at most 100); level 1 is the main brake line. */
  readonly paths: readonly BrakePath[];
  /** Brake distribution: spans s1 to s5 along the vault from the center (%), `bd(1..5,1)`. */
  readonly distributionSpans: readonly [number, number, number, number, number];
  /** Brake distribution: length increments d1 to d5 at these spans, `bd(1..5,2)`. */
  readonly distributionIncrements: readonly [number, number, number, number, number];
}

export interface BrakePath {
  /** Number of levels, `mc(ii,i,1)` (integer): 1 to 4, 2 to 4 in typed rows. */
  readonly levels: number;
  /** Level and order of the line at each level, `mc(ii,i,2..9)`: four pairs. */
  readonly branches: readonly [Branch, Branch, Branch, Branch];
  /** Anchor row, `mc(ii,i,14)` (integer). */
  readonly anchorRow: number;
  /** Anchor rib, `brake(i,3)`: 8.4 anchors 40 % of the way from rib 8 to rib 9. */
  readonly anchorRib: number;
  /** Line type of each level, `mc(ii,i,31..)`: typed rows only. */
  readonly lineTypes?: readonly number[];
}

/** Distances from the start of a ramification to the sail, `raml(k,j)`. */
export interface Ramifications {
  /** Paths of 3 levels: `raml(3,1)` (3) and l2, `raml(3,3)`. */
  readonly lines3: { readonly level: number; readonly l2: number };
  /** Paths of 4 levels: `raml(4,1)` (4), l3 `raml(4,3)` and l2 `raml(4,4)`. */
  readonly lines4: { readonly level: number; readonly l3: number; readonly l2: number };
  /** Brake paths of 3 levels: `raml(5,1)`, l2 `raml(5,3)`. */
  readonly brakes3: { readonly level: number; readonly l2: number };
  /** Brake paths of 4 levels: `raml(6,1)`, l3 `raml(6,3)` and l2 `raml(6,4)`. */
  readonly brakes4: { readonly level: number; readonly l3: number; readonly l2: number };
}

// --- 12. H, V and VH ribs ---------------------------------------------------------

export interface HvRibs {
  /** Horizontal spacing of the parts in the drawing, `xrsep`. */
  readonly separationX: number;
  /** Vertical spacing of the parts in the drawing, `yrsep`. */
  readonly separationY: number;
  /** Rows (`nhvr`, at most 200). */
  readonly ribs: readonly HvRib[];
}

export interface HvRib {
  /** Row number, `hvr(i,1)`. */
  readonly number: number;
  /**
   * Type, `hvr(i,2)`: 1 horizontal strap, 2 partial V-rib, 3 full V-rib,
   * 4 VH-rib over 3 cells, 5 continuous VH-rib, 6 diagonal or band
   * anywhere; 11 to 16 the same with lengths in % of chord.
   */
  readonly type: number;
  /**
   * `hvr(i,3..10)`, or `hvr(i,3..12)` for types 6 and 16. Column 3 is the
   * rib; types 1 to 5 put an anchor row in column 4, and type 1 a second
   * rib and row in columns 5 and 6. Types 6 and 16: initial rib, x1 (% of
   * chord), h1 (% of thickness), r1+, r1-, final rib, x2, h2, r2+, r2-.
   */
  readonly parameters: readonly number[];
}

// --- 15, 16. Colors -----------------------------------------------------------

export type Colors =
  /** Marks on ribs (`npce` ≥ 0 rows; 0: no marks). */
  | { readonly mode: 'ribs'; readonly ribs: readonly ColorRib[] }
  /** Cuts by panel (`npce` = -2). */
  | { readonly mode: 'panels'; readonly panels: readonly ColorPanel[] };

export interface ColorRib {
  /** Rib, `npc1e(k)` (integer). */
  readonly rib: number;
  /** Marks (`npc2e(k)`, at most 100). */
  readonly marks: readonly ColorMark[];
}

export interface ColorMark {
  /** `npc3e(k,l)` (integer). */
  readonly number: number;
  /** `xpc1e(k,l)`, `xpc2e(k,l)` (% of chord). */
  readonly positions: readonly [number, number];
}

export interface ColorPanel {
  /** Panel, between ribs `panel - 1` and `panel`, `npac1e(k)` (integer). */
  readonly panel: number;
  /** Cuts (`npac2e(k)`, at most 100). */
  readonly cuts: readonly ColorCut[];
}

export interface ColorCut {
  /** Cut number, `npac3e(k,l)` (integer). */
  readonly number: number;
  /** Left end of the cut (% of chord from the trailing edge), `xpac1e`. */
  readonly left: number;
  /** Right end of the cut (% of chord from the trailing edge), `xpac2e`. */
  readonly right: number;
  /** Seam width (mm), `xpac3e`. */
  readonly seamWidth: number;
  /** `xpac4e`, unused (0). */
  readonly unused: number;
}

// --- 17, 18 ---------------------------------------------------------------------

/** `xarp(i)`, `yarp(i)` (% of chord). */
export type RibPoint = readonly [x: number, y: number];

export interface ElasticLines {
  /** Flight load (kg), `csusl`. */
  readonly flightLoad: number;
  /** Load distribution (%) between 2, 3, 4 and 5 lines of a rib, `cdis(n,1..n)`. */
  readonly distribution: readonly [
    readonly [number, number],
    readonly [number, number, number],
    readonly [number, number, number, number],
    readonly [number, number, number, number, number],
  ];
  /** Deformations under 10 kg, by number of lines per rib, `csus(i,1..4)`. */
  readonly deformation: readonly [
    LineDeformation,
    LineDeformation,
    LineDeformation,
    LineDeformation,
    LineDeformation,
  ];
}

export interface LineDeformation {
  /** Lines per rib (1 to 5), `csus(i,1)`. */
  readonly lines: number;
  /** Deformation at the lower, medium and higher levels, `csus(i,2..4)`. */
  readonly lower: number;
  readonly medium: number;
  readonly higher: number;
}

// --- 20 ------------------------------------------------------------------------

/** A mark type: its print and laser forms. */
export interface MarkType {
  /** `typm1` (integer, 1 constructed point, 2 mini circle), `typm2`, `typm3` (mm). */
  readonly print: MarkForm;
  /** `typm4` (integer), `typm5`, `typm6` (mm). */
  readonly laser: MarkForm;
}

export interface MarkForm {
  /** Form (integer). */
  readonly type: number;
  /** Radius or separation (mm); its meaning varies by mark. */
  readonly size: number;
  /** Offset (mm); its meaning varies by mark. */
  readonly offset: number;
}

// --- 21. Nylon rods -------------------------------------------------------------

export type Joncs =
  | { readonly mode: 0 }
  /** One bloc of classic nose rods (`ng21` groups). */
  | { readonly mode: 1; readonly groups: readonly NoseRodGroup[] }
  /** Several blocs (`k21blocs`, at most 20). */
  | { readonly mode: 2; readonly blocs: readonly JoncBloc[] };

/** Ribs of a group: `ngoo(m,ng,1..3)` (integers). */
export interface RibGroup {
  /** Group number. */
  readonly group: number;
  readonly firstRib: number;
  readonly lastRib: number;
}

/** A rod curve: from and to (% of chord), maximum deflection (%), exponent. */
export interface RodCurve {
  readonly from: number;
  readonly to: number;
  readonly deflection: number;
  readonly exponent: number;
}

/** The pocket: rod offset (mm), outer pocket width, rod width, inner pocket width. */
export interface RodPocket {
  readonly offset: number;
  readonly outerWidth: number;
  readonly rodWidth: number;
  readonly innerWidth: number;
}

/** Type 1, around the nose: `xextraa(1..4)`, `xintraa(1..4)`, `sjoo(1..4)`. */
export interface NoseRodGroup extends RibGroup {
  readonly extrados: RodCurve;
  readonly intrados: RodCurve;
  readonly pocket: RodPocket;
}

/** Types 4 (extrados) and 5 (intrados): initial and final parts, `xextraa`, `xintraa`. */
export interface LongRodGroup extends RibGroup {
  readonly initial: RodCurve;
  readonly final: RodCurve;
  readonly pocket: RodPocket;
}

/** Type 2, an arc or a straight rod: `x21(1..5)`, `sjoo(1..4)`. */
export interface ArcRodGroup extends RibGroup {
  /** Start and end points (% of chord). */
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  /** Maximum deflection of the arc; 0 draws a straight rod. */
  readonly deflection: number;
  readonly pocket: RodPocket;
}

/** Type 3, shark nose (two rods): in file order, `xextraa(1..4)`, `xextraa(5..8)`, `xintraa(5..8)`, `xintraa(1..4)`. */
export interface SharkNoseGroup extends RibGroup {
  readonly extrados: RodCurve;
  /** Bottom part of the upper rod. */
  readonly upperRod: RodCurve;
  /** Upper part of the lower rod. */
  readonly lowerRod: RodCurve;
  readonly intrados: RodCurve;
  readonly pocket: RodPocket;
}

/** A bloc `k21blocf(m,1..3)` (integers): its number, rod type and groups (at most 100). */
export type JoncBloc =
  | { readonly number: number; readonly type: 1; readonly groups: readonly NoseRodGroup[] }
  | { readonly number: number; readonly type: 2; readonly groups: readonly ArcRodGroup[] }
  | { readonly number: number; readonly type: 3; readonly groups: readonly SharkNoseGroup[] }
  | { readonly number: number; readonly type: 4 | 5; readonly groups: readonly LongRodGroup[] };

// --- 22 to 25 -------------------------------------------------------------------

export type NoseMylars =
  | { readonly mode: 0 }
  /** `ng22` groups (at most 100). */
  | { readonly mode: 1; readonly groups: readonly NoseMylarGroup[] };

export interface NoseMylarGroup extends RibGroup {
  /** `xmy(ng,1..6)` (undocumented). */
  readonly values: readonly [number, number, number, number, number, number];
}

/** `k23d` (integer): "still not functional", 0 is the only documented value. */
export interface TabReinforcements {
  readonly mode: number;
}

export type Dxf2d =
  /** Default colors. */
  | { readonly mode: 0 }
  /** Colors of the A to F lines, `iccolor(1..6)` (integers, DXF color indices). */
  | {
      readonly mode: 1;
      readonly lineColors: readonly [number, number, number, number, number, number];
    };

export type Dxf3d =
  | { readonly mode: 0 }
  | {
      readonly mode: 1;
      /** Colors of the A to F lines, `iccolor(11..16)` (integers). */
      readonly lineColors: readonly [number, number, number, number, number, number];
      /** Extrados, vents and intrados surfaces, `ele3d(k)`, `ele3dc(k)` (integers). */
      readonly surfaces: readonly [Surface3d, Surface3d, Surface3d];
    };

export interface Surface3d {
  /** 1 to draw the surface, 0 not to. */
  readonly drawn: number;
  /** DXF color index. */
  readonly color: number;
}

// --- 26 to 28 -------------------------------------------------------------------

export type GlueVents =
  | { readonly mode: 0 }
  /** One row per rib of the half wing. */
  | { readonly mode: 1; readonly ribs: readonly GlueVent[] };

export interface GlueVent {
  /**
   * Vent type, `rib(i,165)`: 0 open, 1 glued to the extrados, -1 to the
   * intrados, -2 and -3 diagonal, ±4 general diagonal, ±5 arched, ±6
   * elliptical inlet.
   */
  readonly type: number;
  /**
   * Types ±4 and ±6: `csi(i,19)`, `csi(i,20)` (left and right, or x and y
   * widths, %). Types ±5: the same and the arch depth `csi(i,18)`. Other
   * types: none.
   */
  readonly parameters: readonly number[];
}

export type WingTip =
  | { readonly mode: 0 }
  /** Angles of the leading and trailing edges of the last cell (deg), `alc1`, `alc2`. */
  | { readonly mode: 1; readonly angleLE: number; readonly angleTE: number }
  /** Rounded parabolic wing tip (planform only): `sectx(27,3..4)`, the angle in deg. */
  | { readonly mode: 2; readonly distance: number; readonly angle: number }
  /** Last rib displacement and rotation, `sectx(27,10..11)`. */
  | { readonly mode: 4; readonly displacement: number; readonly rotation: number };

export type CalageVariation =
  | { readonly mode: 0 }
  | {
      readonly mode: 1;
      /** Number of risers, `nriser28` (integer, 2 to 6). */
      readonly risers: number;
      /** Riser positions (% of the central chord), `p28(1..6)`. */
      readonly positions: readonly [number, number, number, number, number, number];
      /** Maximum negative angle of the speed system (deg), `a128`. */
      readonly speedAngle: number;
      /** Its number of steps, `n128` (integer). */
      readonly speedSteps: number;
      /** Maximum positive angle of the trimmers (deg), `a228`. */
      readonly trimAngle: number;
      /** Its number of steps, `n228` (integer). */
      readonly trimSteps: number;
    };

// --- 29. 3D shaping -------------------------------------------------------------

export type Shaping =
  | { readonly mode: 0 }
  | {
      /** 1; 2 reads the cut points into `xiupp`/`xilow`, which the engine ignores. */
      readonly mode: 1 | 2;
      /** Shaping model, `k29dd` (integer, 1). */
      readonly model: number;
      /** Groups (`ng29`, at most 200). */
      readonly groups: readonly ShapingGroup[];
      /** Print parameters `pp29(1..5,1..4)` (integers). */
      readonly print: ShapingPrint;
    };

export interface ShapingGroup {
  /** Group number given to its ribs, `k` (integer). */
  readonly group: number;
  /** `ini29(ng)` (integer). */
  readonly firstRib: number;
  /** `fin29(ng)` (integer). */
  readonly lastRib: number;
  /** Upper surface: subtype `upptype` and up to 2 cuts (`uppcuts`). */
  readonly upper: { readonly type: number; readonly cuts: readonly ShapingCut[] };
  /** Lower surface: subtype `lowtype` and up to 1 cut (`lowcuts`). */
  readonly lower: { readonly type: number; readonly cuts: readonly ShapingCut[] };
}

/**
 * A cut, `iupp(c,1..3)` or `ilow(c,1..3)` (integers) and `kiupp(c)`: its
 * number, two points of the airfoil (upper: start of the zone of influence
 * and cut point; lower: cut point and end of the zone), and the depth
 * coefficient (around ±1).
 */
export interface ShapingCut {
  readonly number: number;
  readonly start: number;
  readonly end: number;
  readonly depth: number;
}

/** `pp29(1..5,1..4)`: interpolation, ovalization, tessellation, DXF and STL outputs. */
export interface ShapingPrint {
  readonly interpolation: PrintRange;
  readonly ovalization: PrintRange;
  readonly tessellation: PrintRange;
  readonly dxf: PrintRange;
  readonly stl: PrintRange;
}

/** Draw (1) or not (0), first and last airfoil or panel, one side only (1) or symmetric (0). */
export interface PrintRange {
  readonly draw: number;
  readonly first: number;
  readonly last: number;
  readonly oneSide: number;
}

// --- 30 to 33 -------------------------------------------------------------------

export type Thickness =
  | { readonly mode: 0 }
  /** Thickness coefficient of each rib of the half wing (1 unchanged), `rib(i,160)`. */
  | { readonly mode: 1; readonly ribs: readonly number[] };

export type SkinTensionGroups =
  | { readonly mode: 0 }
  /** `ngskt` groups. */
  | { readonly mode: 1; readonly groups: readonly SkinTensionGroup[] };

export interface SkinTensionGroup {
  /** `ngi` (integer). */
  readonly group: number;
  /** `nribini` (integer). */
  readonly firstRib: number;
  /** `nribfin` (integer). */
  readonly lastRib: number;
  /** Interpolation type, `ntype31` (integer, 1 linear). */
  readonly type: number;
  /**
   * Points `skinew(k,1..4)` (`npoints`, 2 to 100): extrados distance
   * from the leading edge and its overwidth, intrados distance from the
   * trailing edge and its overwidth.
   */
  readonly points: readonly SkinTensionPoint[];
}

export type PartsSeparation =
  | { readonly mode: 0 }
  /** Multiplication factors of the default separations of the parts. */
  | {
      readonly mode: 1;
      readonly panelX: number;
      readonly panelXMin: number;
      readonly panelY: number;
      readonly ribX: number;
      readonly ribY: number;
      readonly rib1Y: number;
      readonly joncX: number;
      readonly joncY: number;
      readonly joncI: number;
      /** `xgname`: read, unused. */
      readonly parameter10: number;
    };

export type Risers =
  /** All risers as long as `angleOfAttack.risersLength`. */
  | { readonly mode: 0 }
  /** One length per line plan (`x33(1..slp)`). */
  | { readonly mode: 1; readonly type: 1; readonly lengths: readonly number[] }
  /** Vario seat with 2, 3 or 4 points (`k33t`, integer, not available): nothing more is read. */
  | { readonly mode: 1; readonly type: 2 | 3 | 4 };

// --- 34. Line types -------------------------------------------------------------

export type LineTypes =
  /** The engine's default table (6 types). */
  | { readonly mode: 0 }
  /** `k34n` types (at most 50), numbered 1, 2, 3… in order. */
  | { readonly mode: 1; readonly types: readonly LineType[] };

interface LineTypeCommon {
  /** Type number, `jltype(i)` (integer). */
  readonly number: number;
  /** Label, `tylinea(i,4)` (CHARACTER*30). */
  readonly name: string;
  /** Strength (daN), `tyline(i,5)`. */
  readonly strength: number;
  /** Material, `tylinea(i,6)` (CHARACTER*30). */
  readonly material: string;
  /** Weight (g/m), `tyline(i,7)`. */
  readonly weight: number;
  /** Loop: "s" stitched or "p" spliced, `tylinea(i,8)` (CHARACTER*30). */
  readonly loopType: string;
  /** Loop length (cm), `tyline(i,9)`. */
  readonly loopLength: number;
  /** CAD color (used with code 1341 of section 37), `tyline(i,10)`. */
  readonly color: number;
}

export type LineType =
  /** Rectangular section a × b (mm), `tyline(i,2..3)`: risers. */
  | (LineTypeCommon & { readonly kind: 'r'; readonly width: number; readonly thickness: number })
  /** Circular section (mm), `tyline(i,2)`. */
  | (LineTypeCommon & { readonly kind: 'c'; readonly diameter: number });

// --- 35 to 37 -------------------------------------------------------------------

export type Equilibrium =
  | { readonly mode: 0 }
  | {
      readonly mode: 1;
      /** `x35grav` (m/s²). */
      readonly gravity: number;
      /** `x35ro` (kg/m³). */
      readonly airDensity: number;
      /** Dynamic viscosity (µPa·s), `x35mu`. */
      readonly viscosity: number;
      /** Estimated speed (m/s), `x35v`. */
      readonly speed: number;
      /** Estimated angle of attack (deg), `x35alpha`. */
      readonly alpha: number;
      /** Lift coefficient, `x35cl`. */
      readonly cl: number;
      /** Multiplier of the lift coefficient, `x35cle`. */
      readonly cle: number;
      /** Drag coefficient, `x35cd`. */
      readonly cd: number;
      /** Multiplier of the drag coefficient, `x35cde`. */
      readonly cde: number;
      /** Moment coefficient, `x35cm`. */
      readonly cm: number;
      /** Pilot and harness frontal surface (m²), `x35spilot`. */
      readonly pilotSurface: number;
      /** Pilot and harness drag coefficient, `x35dpcoef`. */
      readonly pilotDrag: number;
      /** Wing mass without lines and risers (kg), `x35wingmass`. */
      readonly wingMass: number;
      /** Pilot mass with harness (kg), `x35pilotmass`. */
      readonly pilotMass: number;
      /** Pilot mass center below the karabiners (m), `x35pmc`. */
      readonly pilotMassCenter: number;
      /** Mass of one quick link (g), `x35qlmass`. */
      readonly quickLinkMass: number;
      /** y of the center of pressure (m), `x35ycp`. */
      readonly ycp: number;
      /** z of the center of pressure (m), `x35zcp`. */
      readonly zcp: number;
    };

export type Xflr5 =
  | { readonly mode: 0 }
  | {
      readonly mode: 1;
      /** Panels: `k36_a` along the chord, `k36_b` per cell, `k36_c` and `k36_d` their distributions (integers). */
      readonly panels: {
        readonly chord: number;
        readonly span: number;
        readonly chordDistribution: number;
        readonly spanDistribution: number;
      };
      /** Include billowed airfoils, `k36_e` (integer, not working yet). */
      readonly billowed: number;
    };

export type SpecialParameters =
  | { readonly mode: 0 }
  /** `k37n` entries (at most 250). */
  | { readonly mode: 1; readonly entries: readonly SpecialParameter[] };

/** One line of section 37, by code (`icode37(i)`). */
export type SpecialParameter =
  /**
   * Integers: 1291 STL segments `nsegments`, 1341 colors by line type
   * `i37c` (0, 1), 1351 equilibrium method `i37solve`, 1352 flat (1) or
   * projected (2) area `i37fparea`, 1353 output detail `i37output` (0 to 2),
   * 3002 ellipse segments `nelliref`, 2005 `i37_2005` and 2006 `i37_2006`
   * reference lines (0, 1).
   */
  | {
      readonly code: 1291 | 1341 | 1351 | 1352 | 1353 | 2005 | 2006 | 3002;
      readonly value: number;
    }
  /** 1146 center of gravity of a section (%) `chord_pcdg`, 2003 forced assiette (deg) `assiette2003`. */
  | { readonly code: 1146 | 2003; readonly value: number }
  /** 2000: edition date, `a37date` (CHARACTER*30). */
  | { readonly code: 2000; readonly value: string }
  /** 3001: minirib transitions, `i3001(2)` (1 to 3) and `c3001(3..4)`, the first a length (% of chord). */
  | {
      readonly code: 3001;
      readonly transition: 1 | 2 | 3;
      readonly values: readonly [number, number];
    };

// --- 38, 39 ---------------------------------------------------------------------

export type HvrHoles =
  | { readonly mode: 0 }
  /** `k38lines` rows (at most 100). */
  | { readonly mode: 1; readonly rows: readonly HvrHoleRow[] };

/** `x38data(k,1..9)`, read as reals; the first four are integers. */
export interface HvrHoleRow {
  /** Line number. */
  readonly number: number;
  /** V-rib type: 5, 6, 15 or 16, or 9 for the airfoil miniribs. */
  readonly type: number;
  /** 0 no holes, 1 holes with the type 1 distribution. */
  readonly drawn: number;
  /** Number of holes. */
  readonly holes: number;
  /** Hole height (% of the local height). */
  readonly height: number;
  /** Hole width (%). */
  readonly width: number;
  /** Type 5/6/15/16: center position factor (0 to 1); type 9: excentricity a/b. */
  readonly center: number;
  /** Type 9: displacement of the center from the chord (-1 to 1); unused otherwise. */
  readonly offset: number;
  /** Unused. */
  readonly unused: number;
}

export interface HvrPositions {
  /** `k39d` (integer): 0 sets the coefficients of types 1, 2, 3, 5 and 6 to 1 before any reading. */
  readonly mode: 0 | 1;
  /**
   * Read only when section 38 is active (`k38d` > 0), whatever the mode:
   * factors of the horizontal and vertical separations of the V-rib types
   * 1 to 6 in the drawing, `vrib_n_coe1`, `vrib_n_coe2`.
   */
  readonly coefficients?: readonly [
    SeparationFactors,
    SeparationFactors,
    SeparationFactors,
    SeparationFactors,
    SeparationFactors,
    SeparationFactors,
  ];
}

export interface SeparationFactors {
  readonly horizontal: number;
  readonly vertical: number;
}
