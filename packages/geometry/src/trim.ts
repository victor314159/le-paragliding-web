// Section 8 as the engine uses it: its trim estimate (§10.1) and the main
// karabiners, where the risers start (§10.3).
import type { LepDesign } from '@lepara/format';
import { finite, type Point3 } from './ribs.ts';

const degrees = (radians: number) => (radians * 180) / Math.PI;

/** The central rib's leading edge and the lengths of section 8, at Wing scale (§10.1). */
function trimLengths({
  geometry,
  angleOfAttack: a,
}: Pick<LepDesign, 'geometry' | 'angleOfAttack'>) {
  const center = geometry.ribs[0];
  const scale = geometry.wingScale;
  const chord = center ? (center.yTE - center.yLE) * scale : Number.NaN;
  return {
    leading: center ? center.yLE * scale : Number.NaN,
    calage: (a.calage / 100) * chord,
    pressure: (a.centerOfPressure / 100) * chord,
    height: a.linesLength * scale + a.risersLength,
  };
}

/**
 * The trim the engine estimates (§10.1), at Wing scale: the calage and the
 * center of pressure along the central chord, the height of the karabiners
 * (lines at Wing scale, risers not), and in degrees the attitude, below the
 * horizon when positive, the glide path angle and the angle of attack;
 * undefined for incomplete or impossible inputs.
 */
export function trimEstimate(design: Pick<LepDesign, 'geometry' | 'angleOfAttack'>) {
  const { calage, pressure, height } = trimLengths(design);
  const a = design.angleOfAttack;
  const sine = (pressure - calage) / height;
  const attitude = degrees(Math.asin(sine));
  const glide = degrees(Math.atan(1 / a.glideRatio));
  const estimate = { attitude, glide, angleOfAttack: glide - attitude, calage, pressure, height };
  return Object.values(estimate).every(finite) && Math.abs(sine) <= 1 && a.glideRatio > 0
    ? estimate
    : undefined;
}

/**
 * The right main karabiner (`xkar`, `ykar`, `zkar`): half their separation
 * from the center, below the calage at the karabiners' height.
 */
export function karabiner(design: Pick<LepDesign, 'geometry' | 'angleOfAttack'>) {
  const { leading, calage, height } = trimLengths(design);
  const point: Point3 = [design.angleOfAttack.karabinerSeparation / 2, leading + calage, height];
  return point.every(finite) ? point : undefined;
}
