// What the lines (§12) and the brakes (§14) of the engine share: reading
// their lines from the paths, and placing them level by level.
import type { LinePath } from '@lepara/format';
import { finite, type Point3 } from './ribs.ts';

/** A path of section 9 or 10: its anchor rib may be fractional in section 10. */
export type PathLike = Pick<LinePath, 'levels' | 'branches' | 'anchorRow' | 'anchorRib'>;

/**
 * A line (`corda`): its plan (from 1, the brakes after the lines), level
 * and order; `paths`, the number of consecutive paths through it
 * (`corda(i,4)`); `levels`, `row` and `rib`, those of the path it was read
 * from, the rib truncated; its ends at Wing scale.
 */
export interface SuspensionLine {
  readonly plan: number;
  readonly level: number;
  readonly order: number;
  readonly paths: number;
  readonly levels: number;
  readonly row: number;
  readonly rib: number;
  readonly start: Point3;
  readonly end: Point3;
}

export type ListedLine = Omit<SuspensionLine, 'start' | 'end'>;

export const branch = (path: PathLike, slot: number) => path.branches[slot] ?? [0, 0];

/**
 * The lines of `plans`, numbered from `first` (§12.2, 14.2): each run of
 * paths with the same line at a level, the counter carried over, as the
 * engine does, across levels and plans until a line is counted.
 */
export function lineList(plans: readonly { readonly paths: readonly PathLike[] }[], first = 1) {
  const lines: ListedLine[] = [];
  let count = 1;
  let [a, b, aa, bb] = [0, 0, 0, 0];
  plans.forEach(({ paths }, plan) => {
    const add = (path: PathLike, slot: number) => {
      const [level, order] = branch(path, slot);
      lines.push({
        plan: plan + first,
        level,
        order,
        paths: count,
        levels: path.levels,
        row: path.anchorRow,
        rib: Math.trunc(path.anchorRib),
      });
      count = 1;
    };
    for (let slot = 0; slot < 4; slot++)
      for (let j = 0; j < paths.length - 1; j++) {
        // A path of 5 levels keeps the previous pair, as the engine reads none.
        if (paths[j].levels <= 4) {
          [a, b] = branch(paths[j], slot);
          [aa, bb] = branch(paths[j + 1], slot);
        }
        if (a === 0 || b === 0) continue;
        const last = j === paths.length - 2;
        if (a === aa && b === bb) {
          count++;
          if (last) add(paths[j + 1], slot);
        }
        if (a !== aa || b !== bb) add(paths[j], slot);
        if (last) {
          [a, b] = branch(paths[j], slot);
          [aa, bb] = branch(paths[j + 1], slot);
          if ((a !== aa || b !== bb) && aa !== 0 && bb !== 0) add(paths[j + 1], slot);
        }
      }
  });
  return lines;
}

/**
 * The point `distance` from `from` towards `to`, the distance truncated to
 * whole centimeters: the engine assigns it to `t`, declared integer.
 */
export function toward(from: Point3, to: Point3, distance: number): Point3 {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const t = Math.trunc(distance);
  return [0, 1, 2].map((axis) => from[axis] + ((to[axis] - from[axis]) / length) * t) as [
    number,
    number,
    number,
  ];
}

const distance = (a: Point3, b: Point3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** How a network of lines places them. */
export interface Network {
  readonly list: readonly ListedLine[];
  /** The paths of a plan. */
  paths(plan: number): readonly PathLike[];
  /** The point a line aims at: the anchors it holds, weighted. */
  action(line: ListedLine): Point3 | undefined;
  /** The start and length of a line of level 1. */
  first(line: ListedLine): readonly [Point3 | undefined, number];
  /** Whether the lines of level 2 start at the first line of level 1, not their parent. */
  readonly fromFirst: boolean;
  anchor(line: ListedLine): Point3 | undefined;
  /** Ramification lengths at Wing scale: paths of 3 levels, then of 4 (l3, l2). */
  readonly ramifications: readonly [number, number, number];
}

/**
 * The lines of a network placed level by level (§12.6, 14.5): each from the
 * end of its parent (the last path of its plan through it) towards its
 * action point, to its anchor at its path's last level, else to the
 * ramification length before that point; a line of level 3 on a path of 4
 * as long as its two ramification lengths apart, whatever the distance to
 * that point. Lines it cannot place are left out.
 */
export function placeLines(network: Network): SuspensionLine[] {
  const [three, four3, four2] = network.ramifications;
  const parent = (line: ListedLine, slot: number) => {
    let order: number | undefined;
    for (const path of network.paths(line.plan)) {
      const [level, own] = branch(path, slot);
      if (level === line.level && own === line.order) order = branch(path, slot - 1)[1];
    }
    return order;
  };
  const ends = new Map<string, Point3>();
  const placed: SuspensionLine[] = [];
  for (let level = 1; level <= 4; level++)
    for (const line of network.list.filter((l) => l.level === level)) {
      const target = network.action(line);
      const [first, length] = network.first(line);
      const above = level === 2 && network.fromFirst ? 1 : parent(line, level - 1);
      const from = level === 1 ? first : ends.get(`${line.plan}/${level - 1}/${above}`);
      if (!target || !from) continue;
      const end =
        level === 1
          ? toward(from, target, length)
          : level === line.levels
            ? network.anchor(line)
            : level === 2 && line.levels === 3
              ? toward(from, target, distance(from, target) - three)
              : level === 2 && line.levels === 4
                ? toward(from, target, distance(from, target) - four3)
                : level === 3 && line.levels === 4
                  ? toward(from, target, four3 - four2)
                  : undefined;
      if (!end?.every(finite)) continue;
      ends.set(`${line.plan}/${level}/${line.order}`, end);
      placed.push({ ...line, start: from, end });
    }
  return placed;
}
