import { Pipe, type PipeTransform } from '@angular/core';

const UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const;
const FORMATS = UNITS.map(
  (unit) =>
    new Intl.NumberFormat('en', {
      style: 'unit',
      unit,
      unitDisplay: unit === 'byte' ? 'long' : 'short',
      maximumFractionDigits: unit === 'byte' ? 0 : 1,
    }),
);

/** Formats a byte count with a readable unit: `512 bytes`, `21.9 kB`, `54 MB`. */
@Pipe({ name: 'byteSize' })
export class ByteSizePipe implements PipeTransform {
  transform(bytes: number): string {
    const exponent = Math.min(
      UNITS.length - 1,
      Math.max(0, Math.floor(Math.log(bytes) / Math.log(1000))),
    );
    return FORMATS[exponent].format(bytes / 1000 ** exponent);
  }
}
