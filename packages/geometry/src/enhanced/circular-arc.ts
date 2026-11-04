/**
 * Sagitta of a circular arc with the supplied chord and fabric length.
 * Solve theta/sin(theta) = length/chord for the half-angle in (0, pi).
 * Bisection is bounded and monotone; the series avoids cancellation near 0.
 * Short or absent fabric gives a straight segment: fabric strain is not modeled.
 */
export function arcHeight(chord: number, length: number): number {
  if (!Number.isFinite(chord) || !Number.isFinite(length) || chord <= 0 || length <= chord)
    return 0;
  const surplus = (length - chord) / chord;
  if (!Number.isFinite(surplus)) return 0;
  let low = 0,
    high = Math.PI;
  for (let i = 0; i < 64; i++) {
    const theta = (low + high) / 2;
    const x = theta * theta;
    const extra =
      theta < 0.001 ? x * (1 / 6 + x * (7 / 360 + (x * 31) / 15120)) : theta / Math.sin(theta) - 1;
    if (extra < surplus) low = theta;
    else high = theta;
  }
  const theta = (low + high) / 2;
  return (chord / 2) * Math.tan(theta / 2);
}

/** The fabric of a circular arc of the supplied chord and sagitta. */
export function arcLength(chord: number, height: number): number {
  if (height <= 0) return chord;
  const theta = 2 * Math.atan2(2 * height, chord);
  return (chord * theta) / Math.sin(theta);
}

/** Equal-angle samples, evaluated without subtracting nearly equal radii. */
export function arcPoint(chord: number, height: number, t: number): { span: number; lift: number } {
  if (height <= 0 || chord <= 0 || t === 0 || t === 1) return { span: t, lift: 0 };
  const theta = 2 * Math.atan2(2 * height, chord);
  const phi = (2 * t - 1) * theta;
  const sine = Math.sin(theta);
  return {
    span: 0.5 + (0.5 * Math.sin(phi)) / sine,
    lift: (chord * Math.sin((theta + phi) / 2) * Math.sin((theta - phi) / 2)) / sine,
  };
}
