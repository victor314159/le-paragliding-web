import { expect, test } from '@playwright/test';
import * as defaultModel from '@lepara/geometry';
import * as fortran from '@lepara/geometry/fortran-3.29';
import * as enhanced from '@lepara/geometry/enhanced-v1';

test('the default stays Fortran and enhanced changes only its documented functions', () => {
  expect(Object.keys(defaultModel).sort()).toEqual(Object.keys(fortran).sort());
  expect(Object.keys(enhanced).sort()).toEqual(Object.keys(fortran).sort());
  for (const key of Object.keys(fortran) as (keyof typeof fortran)[]) {
    expect(defaultModel[key]).toBe(fortran[key]);
    if (key === 'balloonedSkin') expect(enhanced[key]).not.toBe(fortran[key]);
    else expect(enhanced[key], key).toBe(fortran[key]);
  }
});
