import type { Type } from '@angular/core';
import { Dxf2dSection } from './dxf2d-section';
import { Dxf3dSection } from './dxf3d-section';
import type { Selection } from './editor-state';
import { SewingSection } from './sewing-section';

/**
 * The sections with a form, by number; the others lead to text editing. A
 * form is a component that injects EditorState and binds the fields of its
 * section in `form`.
 */
export const SECTION_FORMS: ReadonlyMap<Selection, Type<unknown>> = new Map<number, Type<unknown>>([
  [6, SewingSection],
  [24, Dxf2dSection],
  [25, Dxf3dSection],
]);
