import { computed, signal, type Signal, type WritableSignal } from '@angular/core';
import type { FieldTree } from '@angular/forms/signals';
import {
  DXF2D_DEFAULTS,
  DXF3D_DEFAULTS,
  LINE_TYPES_DEFAULTS,
  PARTS_SEPARATION_DEFAULTS,
  validate,
  validateDesign,
  type Diagnostic,
  type LepDesign,
  type LepProject,
} from '@lepara/format';
import type * as M from '@lepara/format';
import { dequal } from 'dequal';
import { withSeverity } from '../shared/diagnostics';

/** A model value whose numbers may be null: a number field the user empties. */
type Nullable<T> = T extends number
  ? number | null
  : T extends object
    ? { [K in keyof T]: Nullable<T[K]> }
    : T;
type Keys<T> = T extends unknown ? keyof T : never;
/** Keep all branches of a mode in the form, including those currently hidden. */
type AllModes<T> = {
  readonly [K in Keys<T>]: T extends unknown ? (K extends keyof T ? T[K] : never) : never;
};
type Path = Omit<M.LinePath, 'lineTypes'> & { readonly lineTypes: readonly number[] };
type RodGroup = M.NoseRodGroup & M.ArcRodGroup & M.SharkNoseGroup & M.LongRodGroup;
type RodBloc = Omit<AllModes<M.JoncBloc>, 'groups'> & { readonly groups: readonly RodGroup[] };
type SpecialEntry = {
  readonly code: number;
  readonly value: number | string;
  readonly numberValue: number;
  readonly textValue: string;
  readonly transition: number;
  readonly values: readonly [number, number];
};
type FormSections = {
  readonly geometry: Omit<M.Geometry, 'washin' | 'ribs'> & {
    readonly washin: AllModes<M.Washin>;
    readonly ribs: readonly Required<M.RibGeometry>[];
  };
  readonly lines: Omit<M.Lines, 'plans'> & {
    readonly plans: readonly { readonly paths: readonly Path[] }[];
  };
  readonly brakes: Omit<M.Brakes, 'paths'> & { readonly paths: readonly Path[] };
  readonly extradosColors: AllModes<M.Colors>;
  readonly intradosColors: AllModes<M.Colors>;
  readonly joncs: {
    readonly mode: number;
    readonly groups: readonly RodGroup[];
    readonly blocs: readonly RodBloc[];
  };
  readonly noseMylars: AllModes<M.NoseMylars>;
  readonly dxf2d: AllModes<M.Dxf2d>;
  readonly dxf3d: AllModes<M.Dxf3d>;
  readonly glueVents: AllModes<M.GlueVents>;
  readonly wingTip: AllModes<M.WingTip>;
  readonly calageVariation: AllModes<M.CalageVariation>;
  readonly shaping: AllModes<M.Shaping>;
  readonly thickness: AllModes<M.Thickness>;
  readonly skinTensionGroups: AllModes<M.SkinTensionGroups>;
  readonly partsSeparation: AllModes<M.PartsSeparation>;
  readonly risers: {
    readonly mode: number;
    readonly type: number;
    readonly lengths: readonly number[];
  };
  readonly lineTypes: { readonly mode: number; readonly types: readonly AllModes<M.LineType>[] };
  readonly equilibrium: AllModes<M.Equilibrium>;
  readonly xflr5: AllModes<M.Xflr5>;
  readonly specialParameters: { readonly mode: number; readonly entries: readonly SpecialEntry[] };
  readonly hvrHoles: AllModes<M.HvrHoles>;
  readonly hvrPositions: Required<M.HvrPositions>;
};

/** Field paths match the format model and its diagnostics. */
export type DesignForm = Nullable<Omit<LepDesign, keyof FormSections> & FormSections>;
export type EditorForm = FieldTree<DesignForm>;

export const ROD_CURVE: M.RodCurve = { from: 0, to: 0, deflection: 0, exponent: 1 };
export const ROD_POCKET: M.RodPocket = { offset: 0, outerWidth: 0, rodWidth: 0, innerWidth: 0 };
export function rodGroup(group = 1): RodGroup {
  return {
    group,
    firstRib: 1,
    lastRib: 1,
    extrados: ROD_CURVE,
    intrados: ROD_CURVE,
    upperRod: ROD_CURVE,
    lowerRod: ROD_CURVE,
    initial: ROD_CURVE,
    final: ROD_CURVE,
    pocket: ROD_POCKET,
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
    deflection: 0,
  };
}
export function linePath(brake = false): Path {
  return {
    levels: 2,
    branches: [
      [1, 1],
      [2, 1],
      [0, 0],
      [0, 0],
      [0, 0],
    ],
    anchorRow: brake ? 6 : 1,
    anchorRib: 1,
    lineTypes: brake ? [6, 5, 4, 5, 5] : [1, 2, 3, 4, 5],
  };
}
const pathForm = (path: M.LinePath | M.BrakePath, brake = false): Nullable<Path> => ({
  ...path,
  branches: [
    ...path.branches,
    ...Array.from({ length: 5 - path.branches.length }, (): M.Branch => [0, 0]),
  ],
  lineTypes: Array.from(
    { length: 5 },
    (_, i) => path.lineTypes?.[i] ?? (brake && i === 0 ? 6 : i + 1),
  ),
});
const colorForm = (colors: M.Colors) => ({ ribs: [], panels: [], ...colors });
export const skinPoint = (): M.SkinTensionPoint => ({
  extradosPosition: 0,
  extradosOverwidth: 0,
  intradosPosition: 0,
  intradosOverwidth: 0,
});
const coefficients = () =>
  Array.from({ length: 6 }, () => ({ horizontal: 1, vertical: 1 })) as unknown as NonNullable<
    M.HvrPositions['coefficients']
  >;

export function toForm(design: LepDesign): DesignForm {
  const { geometry, joncs, risers } = design;
  const ribs = geometry.ribs.length;
  const print = { draw: 0, first: 1, last: ribs, oneSide: 0 };
  return {
    ...design,
    geometry: {
      ...geometry,
      washin: { centerAngle: 0, ...geometry.washin },
      ribs: geometry.ribs.map((r) => ({ rotZ: 0, rotZPosition: 0, ...r })),
    },
    lines: {
      ...design.lines,
      plans: design.lines.plans.map((plan) => ({ paths: plan.paths.map((p) => pathForm(p)) })),
    },
    brakes: { ...design.brakes, paths: design.brakes.paths.map((p) => pathForm(p, true)) },
    hvRibs: {
      ...design.hvRibs,
      ribs: design.hvRibs.ribs.map((r) => ({
        ...r,
        parameters: Array.from({ length: 10 }, (_, i) => r.parameters[i] ?? 0),
      })),
    },
    extradosColors: colorForm(design.extradosColors),
    intradosColors: colorForm(design.intradosColors),
    joncs: {
      groups: [],
      blocs: [],
      ...joncs,
      ...(joncs.mode === 1 && { groups: joncs.groups.map((g) => ({ ...rodGroup(), ...g })) }),
      ...(joncs.mode === 2 && {
        blocs: joncs.blocs.map((bloc) => ({
          ...bloc,
          groups: bloc.groups.map((g) => ({ ...rodGroup(), ...g })),
        })),
      }),
    },
    noseMylars: { groups: [], ...design.noseMylars },
    dxf2d: { ...DXF2D_DEFAULTS, ...design.dxf2d },
    dxf3d: { ...DXF3D_DEFAULTS, ...design.dxf3d },
    glueVents: {
      ribs: Array.from({ length: ribs }, () => ({ type: 0, parameters: [0, 0, 0] })),
      ...design.glueVents,
      ...(design.glueVents.mode === 1 && {
        ribs: design.glueVents.ribs.map((r) => ({
          ...r,
          parameters: Array.from({ length: 3 }, (_, i) => r.parameters[i] ?? 0),
        })),
      }),
    },
    wingTip: {
      angleLE: 0,
      angleTE: 0,
      distance: 0,
      angle: 0,
      displacement: 0,
      rotation: 0,
      ...design.wingTip,
    },
    calageVariation: {
      risers: 2,
      positions: [0, 0, 0, 0, 0, 0],
      speedAngle: null,
      speedSteps: null,
      trimAngle: null,
      trimSteps: null,
      ...design.calageVariation,
    },
    shaping: {
      model: 1,
      groups: [],
      print: {
        interpolation: print,
        ovalization: print,
        tessellation: print,
        dxf: print,
        stl: print,
      },
      ...design.shaping,
    },
    thickness: { ribs: Array.from({ length: ribs }, () => 1), ...design.thickness },
    skinTensionGroups: {
      groups: [
        { group: 1, firstRib: 1, lastRib: ribs, type: 1, points: design.skinTension.points },
      ],
      ...design.skinTensionGroups,
    },
    partsSeparation: { ...PARTS_SEPARATION_DEFAULTS, ...design.partsSeparation },
    risers: {
      type: 1,
      lengths: Array.from(
        { length: design.lines.plans.length },
        () => design.angleOfAttack.risersLength,
      ),
      ...risers,
    },
    lineTypes: {
      mode: design.lineTypes.mode,
      types: (design.lineTypes.mode === 1 ? design.lineTypes.types : LINE_TYPES_DEFAULTS.types).map(
        (t) => ({ diameter: 0, width: 0, thickness: 0, ...t }),
      ),
    },
    equilibrium: {
      gravity: null,
      airDensity: null,
      viscosity: null,
      speed: null,
      alpha: null,
      cl: null,
      cle: null,
      cd: null,
      cde: null,
      cm: null,
      pilotSurface: null,
      pilotDrag: null,
      wingMass: null,
      pilotMass: null,
      pilotMassCenter: null,
      quickLinkMass: null,
      ycp: null,
      zcp: null,
      ...design.equilibrium,
    },
    xflr5: {
      panels: { chord: null, span: null, chordDistribution: null, spanDistribution: null },
      billowed: 0,
      ...design.xflr5,
    },
    specialParameters: {
      mode: design.specialParameters.mode,
      entries:
        design.specialParameters.mode === 1
          ? design.specialParameters.entries.map((e) => ({
              value: 0,
              numberValue: e.code !== 2000 && e.code !== 3001 ? e.value : 0,
              textValue: e.code === 2000 ? e.value : '',
              transition: 1,
              values: [0, 0],
              ...e,
            }))
          : [],
    },
    hvrHoles: { rows: [], ...design.hvrHoles },
    hvrPositions: { coefficients: coefficients(), ...design.hvrPositions },
  } as DesignForm;
}

const active = <T extends { readonly mode: number | null }>(section: T) =>
  section.mode === 0 ? { mode: 0 } : section;
const colors = (section: DesignForm['extradosColors']) =>
  section.mode === 'panels'
    ? { mode: 'panels', panels: section.panels }
    : { mode: 'ribs', ribs: section.ribs };
function pathDesign(path: Nullable<Path>, typed: boolean) {
  const { lineTypes, branches, ...rest } = path;
  return {
    ...rest,
    branches: branches.slice(0, path.levels === 5 ? 5 : 4),
    ...(typed && { lineTypes: lineTypes.slice(0, path.levels ?? 0) }),
  };
}
function rodDesign(group: Nullable<RodGroup>, type: number | null) {
  const {
    group: number,
    firstRib,
    lastRib,
    pocket,
    extrados,
    intrados,
    upperRod,
    lowerRod,
    initial,
    final,
    x1,
    y1,
    x2,
    y2,
    deflection,
  } = group;
  const base = { group: number, firstRib, lastRib, pocket };
  if (type === 2) return { ...base, x1, y1, x2, y2, deflection };
  if (type === 3) return { ...base, extrados, intrados, upperRod, lowerRod };
  if (type === 4 || type === 5) return { ...base, initial, final };
  return { ...base, extrados, intrados };
}

/** Only selected modes go to validation and writing; hidden inputs remain in the form. */
export function toDesign(value: DesignForm): LepDesign {
  const { geometry: g, joncs, wingTip: w, risers, specialParameters: sp } = value;
  const washin = { mode: g.washin.mode, maxAngle: g.washin.maxAngle };
  const { mode: wingMode, angleLE, angleTE, distance, angle, displacement, rotation } = w;
  return {
    ...value,
    geometry: {
      ...g,
      washin: g.washin.mode === 2 ? g.washin : washin,
      ribs: g.ribs.map((r) => {
        if (g.ribColumns === 11) return r;
        return {
          number: r.number,
          x: r.x,
          yLE: r.yLE,
          yTE: r.yTE,
          xp: r.xp,
          z: r.z,
          beta: r.beta,
          rotationPoint: r.rotationPoint,
          washin: r.washin,
        };
      }),
    },
    lines: {
      ...value.lines,
      plans: value.lines.plans.map((plan) => ({
        paths: plan.paths.map((p) => pathDesign(p, value.lines.typed)),
      })),
    },
    brakes: {
      ...value.brakes,
      paths: value.brakes.paths.map((p) => pathDesign(p, value.brakes.typed)),
    },
    hvRibs: {
      ...value.hvRibs,
      ribs: value.hvRibs.ribs.map((r) => ({
        ...r,
        parameters: r.parameters.slice(0, r.type === 6 || r.type === 16 ? 10 : 8),
      })),
    },
    extradosColors: colors(value.extradosColors),
    intradosColors: colors(value.intradosColors),
    joncs:
      joncs.mode === 0
        ? { mode: 0 }
        : joncs.mode === 1
          ? { mode: 1, groups: joncs.groups.map((g) => rodDesign(g, 1)) }
          : {
              mode: 2,
              blocs: joncs.blocs.map((b) => ({
                ...b,
                groups: b.groups.map((g) => rodDesign(g, b.type)),
              })),
            },
    noseMylars: active(value.noseMylars),
    dxf2d: active(value.dxf2d),
    dxf3d: active(value.dxf3d),
    glueVents:
      value.glueVents.mode === 0
        ? { mode: 0 }
        : {
            mode: value.glueVents.mode,
            ribs: value.glueVents.ribs.map((r) => ({
              ...r,
              parameters: r.parameters.slice(
                0,
                Math.abs(r.type ?? 0) === 5 ? 3 : [4, 6].includes(Math.abs(r.type ?? 0)) ? 2 : 0,
              ),
            })),
          },
    wingTip:
      wingMode === 1
        ? { mode: 1, angleLE, angleTE }
        : wingMode === 2
          ? { mode: 2, distance, angle }
          : wingMode === 4
            ? { mode: 4, displacement, rotation }
            : { mode: 0 },
    calageVariation: active(value.calageVariation),
    shaping: active(value.shaping),
    thickness: active(value.thickness),
    skinTensionGroups: active(value.skinTensionGroups),
    partsSeparation: active(value.partsSeparation),
    risers:
      risers.mode === 0 ? { mode: 0 } : risers.type === 1 ? risers : { mode: 1, type: risers.type },
    lineTypes: active({
      ...value.lineTypes,
      types: value.lineTypes.types.map((t) => {
        const { diameter, width, thickness, ...common } = t;
        return t.kind === 'r' ? { ...common, width, thickness } : { ...common, diameter };
      }),
    }),
    equilibrium: active(value.equilibrium),
    xflr5: active(value.xflr5),
    specialParameters:
      sp.mode === 0
        ? { mode: 0 }
        : {
            mode: sp.mode,
            entries: sp.entries.map((e) =>
              e.code === 3001
                ? { code: e.code, transition: e.transition, values: e.values }
                : { code: e.code, value: e.value },
            ),
          },
    hvrHoles: active(value.hvrHoles),
    hvrPositions:
      value.hvrHoles.mode === 1 ? value.hvrPositions : { mode: value.hvrPositions.mode },
  } as unknown as LepDesign;
}

/**
 * The edited design of a project, validated by @lepara/format. Its design
 * errors block Save, since writeLep refuses them; the other errors, such as a
 * missing or unreadable airfoil, are shown without blocking. Plain signals:
 * EditorState binds its form.
 */
export class EditorDraft {
  readonly value: WritableSignal<DesignForm>;
  readonly project: Signal<LepProject>;
  readonly diagnostics: Signal<readonly Diagnostic[]>;
  /** The errors that block Save. */
  readonly errors: Signal<readonly Diagnostic[]>;
  /** Saving rewrites leparagliding.txt. */
  readonly changed: Signal<boolean>;

  constructor(initial: LepProject, reading: readonly Diagnostic[] = []) {
    this.value = signal(toForm(initial.design));
    this.project = computed(() => ({ ...initial, design: toDesign(this.value()) }));
    const design = computed(() => validateDesign(this.project().design));
    this.diagnostics = computed(() => validate(this.project(), { reading, design: design() }));
    this.errors = computed(() => withSeverity(design(), 'error'));
    this.changed = computed(() => !dequal(this.project().design, initial.design));
  }
}
