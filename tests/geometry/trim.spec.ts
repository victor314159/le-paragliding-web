import { expect, test } from '@playwright/test';
import { karabiner, trimEstimate } from '../../packages/geometry/src/index.ts';
import { DESIGNS, project } from '../format/helpers';
import { report } from './helpers';

test('the trim estimate and karabiners match the calage properties of lep-out.txt', () => {
  for (const id of DESIGNS) {
    const { design } = project(`oracle/designs/${id}`);
    const out = report(id).join('\n');
    const value = (name: string) =>
      Number(new RegExp(`^\\s*${name}\\s+(-?[\\d.]+)`, 'm').exec(out)?.[1]);
    const estimate = trimEstimate(design);
    expect(estimate?.attitude, id).toBeCloseTo(value('Assiette'), 2);
    expect(estimate?.angleOfAttack, id).toBeCloseTo(value('AoA'), 2);
    expect(estimate?.glide, id).toBeCloseTo(value('Glide angle'), 2);
    const karabiners = /karabiners \(x,y,z\)\s+(\S+)\s+(\S+)\s+(\S+)/
      .exec(out)!
      .slice(1)
      .map(Number);
    karabiner(design)!.forEach((coordinate, axis) =>
      expect(coordinate, id).toBeCloseTo(karabiners[axis], 2),
    );
  }
});
