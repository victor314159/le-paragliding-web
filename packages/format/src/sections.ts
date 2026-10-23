import type { Dxf2d, Dxf3d, LepDesign } from './model.ts';

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
