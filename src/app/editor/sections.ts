/** The 37 sections of format 3.29, in file order. */
export const SECTIONS = (
  [
    [1, 'Geometry'],
    [2, 'Airfoils'],
    [3, 'Anchor points'],
    [4, 'Lightening holes'],
    [5, 'Skin tension'],
    [6, 'Sewing allowances'],
    [7, 'Sewing marks'],
    [8, 'Global angle of attack estimation'],
    [9, 'Suspension lines'],
    [10, 'Brakes'],
    [11, 'Ramification lengths'],
    [12, 'H, V and VH ribs'],
    [15, 'Extrados colors'],
    [16, 'Intrados colors'],
    [17, 'Additional rib points'],
    [18, 'Elastic lines corrections'],
    [19, 'DXF layer names'],
    [20, 'Mark types'],
    [21, 'Nylon rods'],
    [22, 'Nose mylars'],
    [23, 'Tab reinforcements'],
    [24, '2D DXF options'],
    [25, '3D DXF options'],
    [26, 'Glue vents'],
    [27, 'Special wing tip'],
    [28, 'Calage variation study'],
    [29, '3D shaping'],
    [30, 'Airfoil thickness modification'],
    [31, 'Skin tension groups'],
    [32, 'Parts separation'],
    [33, 'Detailed risers'],
    [34, 'Line types'],
    [35, 'Equilibrium equations'],
    [36, 'XFLR5 analysis'],
    [37, 'Special parameters'],
    [38, 'HVR holes'],
    [39, 'HVR positions'],
  ] as const
).map(([number, title]) => ({ number, title }));

/** A section number, or an airfoil's file name. */
export type Selection = number | string;

const FORMS = new Set<Selection>([6, 24, 25]);

export function hasForm(selection: Selection): boolean {
  return FORMS.has(selection);
}
