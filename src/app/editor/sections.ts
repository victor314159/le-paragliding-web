import type { Type } from '@angular/core';
import { AirfoilsSection } from './airfoils-section';
import { AnchorsSection } from './anchors-section';
import { AngleOfAttackSection } from './angle-of-attack-section';
import { BrakesSection } from './brakes-section';
import { CalageVariationSection } from './calage-variation-section';
import { DxfLayersSection } from './dxf-layers-section';
import { Dxf2dSection } from './dxf2d-section';
import { Dxf3dSection } from './dxf3d-section';
import type { Selection } from './editor-state';
import { ElasticLinesSection } from './elastic-lines-section';
import { EquilibriumSection } from './equilibrium-section';
import { ExtradosColorsSection } from './extrados-colors-section';
import { GeometrySection } from './geometry-section';
import { GlueVentsSection } from './glue-vents-section';
import { HolesSection } from './holes-section';
import { HvRibsSection } from './hv-ribs-section';
import { HvrHolesSection } from './hvr-holes-section';
import { HvrPositionsSection } from './hvr-positions-section';
import { IntradosColorsSection } from './intrados-colors-section';
import { JoncsSection } from './joncs-section';
import { LineTypesSection } from './line-types-section';
import { LinesSection } from './lines-section';
import { MarkTypesSection } from './mark-types-section';
import { MarksSection } from './marks-section';
import { NoseMylarsSection } from './nose-mylars-section';
import { PartsSeparationSection } from './parts-separation-section';
import { RamificationsSection } from './ramifications-section';
import { RibPointsSection } from './rib-points-section';
import { RisersSection } from './risers-section';
import { SewingSection } from './sewing-section';
import { ShapingSection } from './shaping-section';
import { SkinTensionGroupsSection } from './skin-tension-groups-section';
import { SkinTensionSection } from './skin-tension-section';
import { SpecialParametersSection } from './special-parameters-section';
import { TabReinforcementsSection } from './tab-reinforcements-section';
import { ThicknessSection } from './thickness-section';
import { WingTipSection } from './wing-tip-section';
import { Xflr5Section } from './xflr5-section';

/** Section components share EditorState and bind the fields at their model paths. */
export const SECTION_FORMS: ReadonlyMap<Selection, Type<unknown>> = new Map<number, Type<unknown>>([
  [1, GeometrySection],
  [2, AirfoilsSection],
  [3, AnchorsSection],
  [4, HolesSection],
  [5, SkinTensionSection],
  [6, SewingSection],
  [7, MarksSection],
  [8, AngleOfAttackSection],
  [9, LinesSection],
  [10, BrakesSection],
  [11, RamificationsSection],
  [12, HvRibsSection],
  [15, ExtradosColorsSection],
  [16, IntradosColorsSection],
  [17, RibPointsSection],
  [18, ElasticLinesSection],
  [19, DxfLayersSection],
  [20, MarkTypesSection],
  [21, JoncsSection],
  [22, NoseMylarsSection],
  [23, TabReinforcementsSection],
  [24, Dxf2dSection],
  [25, Dxf3dSection],
  [26, GlueVentsSection],
  [27, WingTipSection],
  [28, CalageVariationSection],
  [29, ShapingSection],
  [30, ThicknessSection],
  [31, SkinTensionGroupsSection],
  [32, PartsSeparationSection],
  [33, RisersSection],
  [34, LineTypesSection],
  [35, EquilibriumSection],
  [36, Xflr5Section],
  [37, SpecialParametersSection],
  [38, HvrHolesSection],
  [39, HvrPositionsSection],
]);
