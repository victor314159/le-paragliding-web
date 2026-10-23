import type { Dxf2d, Dxf3d, LepDesign, LineTypes, PartsSeparation } from './model.ts';

/** The 37 sections of leparagliding.txt, in file order: number, model key, title. */
export const SECTIONS = (
  [
    [1, 'geometry', 'Geometry'],
    [2, 'airfoils', 'Airfoils'],
    [3, 'anchors', 'Anchor points'],
    [4, 'holes', 'Lightening holes'],
    [5, 'skinTension', 'Skin tension'],
    [6, 'sewingAllowances', 'Sewing allowances'],
    [7, 'marks', 'Sewing marks'],
    [8, 'angleOfAttack', 'Global angle of attack estimation'],
    [9, 'lines', 'Suspension lines'],
    [10, 'brakes', 'Brakes'],
    [11, 'ramifications', 'Ramification lengths'],
    [12, 'hvRibs', 'H, V and VH ribs'],
    [15, 'extradosColors', 'Extrados colors'],
    [16, 'intradosColors', 'Intrados colors'],
    [17, 'ribPoints', 'Additional rib points'],
    [18, 'elasticLines', 'Elastic lines corrections'],
    [19, 'dxfLayers', 'DXF layer names'],
    [20, 'markTypes', 'Mark types'],
    [21, 'joncs', 'Nylon rods'],
    [22, 'noseMylars', 'Nose mylars'],
    [23, 'tabReinforcements', 'Tab reinforcements'],
    [24, 'dxf2d', '2D DXF options'],
    [25, 'dxf3d', '3D DXF options'],
    [26, 'glueVents', 'Glue vents'],
    [27, 'wingTip', 'Special wing tip'],
    [28, 'calageVariation', 'Calage variation study'],
    [29, 'shaping', '3D shaping'],
    [30, 'thickness', 'Airfoil thickness modification'],
    [31, 'skinTensionGroups', 'Skin tension groups'],
    [32, 'partsSeparation', 'Parts separation'],
    [33, 'risers', 'Detailed risers'],
    [34, 'lineTypes', 'Line types'],
    [35, 'equilibrium', 'Equilibrium equations'],
    [36, 'xflr5', 'XFLR5 analysis'],
    [37, 'specialParameters', 'Special parameters'],
    [38, 'hvrHoles', 'HVR holes'],
    [39, 'hvrPositions', 'HVR positions'],
  ] as const satisfies readonly (readonly [number, keyof LepDesign, string])[]
).map(([number, key, title]) => ({ number, key, title }));

/** Section 24 in mode 1 with the colors the engine sets in mode 0. */
export const DXF2D_DEFAULTS: Extract<Dxf2d, { mode: 1 }> = {
  mode: 1,
  lineColors: [1, 30, 3, 4, 6, 5],
};

/** Section 25 in mode 1 with the colors and surfaces the engine sets in mode 0. */
export const DXF3D_DEFAULTS: Extract<Dxf3d, { mode: 1 }> = {
  mode: 1,
  lineColors: [8, 8, 8, 8, 8, 30],
  surfaces: [
    { drawn: 0, color: 5 },
    { drawn: 0, color: 1 },
    { drawn: 0, color: 3 },
  ],
};

/** Section 32: mode 0 uses unit factors (parameter10 is read but unused). */
export const PARTS_SEPARATION_DEFAULTS: Extract<PartsSeparation, { mode: 1 }> = {
  mode: 1,
  panelX: 1,
  panelXMin: 1,
  panelY: 1,
  ribX: 1,
  ribY: 1,
  rib1Y: 1,
  joncX: 1,
  joncY: 1,
  joncI: 1,
  parameter10: 0,
};

/** Section 34: the six line types initialized by the 3.29 engine in mode 0. */
export const LINE_TYPES_DEFAULTS: Extract<LineTypes, { mode: 1 }> = {
  mode: 1,
  types: [
    {
      number: 1,
      kind: 'r',
      width: 25,
      thickness: 2,
      name: 'Riser',
      strength: 1000,
      material: 'polyester',
      weight: 20,
      loopType: 's',
      loopLength: 12,
      color: 7,
    },
    {
      number: 2,
      kind: 'c',
      diameter: 1.9,
      name: 'Line275',
      strength: 275,
      material: 's_dyneem',
      weight: 2.26,
      loopType: 's',
      loopLength: 12,
      color: 1,
    },
    {
      number: 3,
      kind: 'c',
      diameter: 1.4,
      name: 'Line160',
      strength: 160,
      material: 's_dyneem',
      weight: 1.34,
      loopType: 's',
      loopLength: 10,
      color: 30,
    },
    {
      number: 4,
      kind: 'c',
      diameter: 1.15,
      name: 'Line120',
      strength: 120,
      material: 's_dyneem',
      weight: 1,
      loopType: 's',
      loopLength: 10,
      color: 5,
    },
    {
      number: 5,
      kind: 'c',
      diameter: 0.8,
      name: 'Line100U',
      strength: 100,
      material: 'u_dyneem',
      weight: 0.43,
      loopType: 'p',
      loopLength: 8,
      color: 2,
    },
    {
      number: 6,
      kind: 'c',
      diameter: 2,
      name: 'Line200B',
      strength: 160,
      material: 's_dyneem',
      weight: 0.2,
      loopType: 's',
      loopLength: 12,
      color: 6,
    },
  ],
};
