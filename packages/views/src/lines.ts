import type { BrakePath, LinePath } from '@lepara/format';
import { finite, type Point } from './geometry.ts';
import { ANCHOR_NAMES } from './profile.ts';
import { PreviewDrawing, valueLabel, type PreviewContext } from './scene.ts';

type Path = LinePath | BrakePath;

/** Merge branch prefixes, keeping distinct parents distinct in an invalid input tree. */
export function lineTree(paths: readonly Path[]) {
  const nodes = new Map<
    string,
    { key: string; label: string; level: number; leaves: number[]; paths: number[] }
  >();
  const edges = new Map<
    string,
    { from: string; to: string; paths: number[]; type: number | undefined }
  >();
  const leaves: { key: string; index: number; rib: number; row: number }[] = [];
  let omitted = 0;
  const order = paths
    .map((p, index) => ({ p, index }))
    .sort(
      (a, b) =>
        (a.p.anchorRib ?? 0) - (b.p.anchorRib ?? 0) || (a.p.anchorRow ?? 0) - (b.p.anchorRow ?? 0),
    );
  for (const { p, index } of order) {
    if (
      !finite(p.levels) ||
      !Number.isInteger(p.levels) ||
      p.levels < 1 ||
      p.levels > 4 ||
      !finite(p.anchorRib) ||
      !finite(p.anchorRow)
    ) {
      omitted++;
      continue;
    }
    const branches = p.branches.slice(0, p.levels);
    if (
      branches.length !== p.levels ||
      branches.some(
        ([level, number]) => !finite(level) || !finite(number) || level <= 0 || number <= 0,
      )
    ) {
      omitted++;
      continue;
    }
    const position = leaves.length;
    let parent = 'root';
    if (!nodes.has(parent))
      nodes.set(parent, { key: parent, label: 'Riser', level: 0, leaves: [], paths: [] });
    nodes.get(parent)!.leaves.push(position);
    nodes.get(parent)!.paths.push(index);
    branches.forEach(([level, number], j) => {
      const key = `${parent}/${level}.${number}`;
      if (!nodes.has(key))
        nodes.set(key, { key, label: `${level}.${number}`, level: j + 1, leaves: [], paths: [] });
      const node = nodes.get(key)!;
      node.leaves.push(position);
      node.paths.push(index);
      if (!edges.has(key))
        edges.set(key, { from: parent, to: key, paths: [], type: p.lineTypes?.[j] });
      edges.get(key)!.paths.push(index);
      parent = key;
    });
    const key = `${parent}/anchor-${index}`;
    nodes.set(key, {
      key,
      label: `${ANCHOR_NAMES[p.anchorRow - 1] ?? '?'} · rib ${p.anchorRib}`,
      level: 5,
      leaves: [position],
      paths: [index],
    });
    edges.set(key, { from: parent, to: key, paths: [index], type: undefined });
    leaves.push({ key, index, rib: p.anchorRib, row: p.anchorRow });
  }
  const width = Math.max(600, leaves.length * 28);
  return {
    nodes: [...nodes.values()].map((node) => ({
      ...node,
      point: [
        50 +
          ((node.leaves.reduce((sum, i) => sum + i, 0) / node.leaves.length + 0.5) *
            (width - 100)) /
            Math.max(1, leaves.length),
        250 - node.level * 45,
      ] as Point,
    })),
    edges: [...edges.values()],
    leaves,
    omitted,
    width,
  };
}

export function networkScene(context: PreviewContext<'lines' | 'brakes'>, brake: boolean) {
  const { design, selected, active } = context;
  const paths = brake ? design.brakes.paths : (design.lines.plans[selected]?.paths ?? []);
  const tree = lineTree(paths);
  const d = new PreviewDrawing(
    brake ? 'Brake connections' : `Suspension connections · plan ${selected + 1}`,
    'Connection diagram; branch positions and segment lengths are schematic. Focus a path to highlight its connections.',
  );
  const nodes = new Map(tree.nodes.map((node) => [node.key, node]));
  for (const edge of tree.edges) {
    const from = nodes.get(edge.from)!,
      to = nodes.get(edge.to)!;
    d.path(
      [from.point, to.point],
      'connection',
      edge.paths.includes(active),
      edge.type ? `Line type ${edge.type}` : '',
    );
  }
  for (const node of tree.nodes) {
    const chosen = node.paths.includes(active);
    d.dot(node.point, chosen ? 3.5 : 2, node.label, chosen);
    if (chosen) d.label([node.point[0], node.point[1] - 10], node.label);
  }
  d.frame([
    [0, -5],
    [tree.width, 280],
  ]);
  const path = paths[active];
  if (path)
    d.label(
      [tree.width / 2, 278],
      `Path ${active + 1} · ${path.levels ?? '—'} levels · ${ANCHOR_NAMES[(path.anchorRow ?? 0) - 1] ?? '?'} · rib ${valueLabel(path.anchorRib)}`,
    );
  if (!paths.length) d.label([tree.width / 2, 130], 'Add a path to preview its connections');
  if (tree.omitted) d.label([tree.width / 2, 12], `${tree.omitted} incomplete paths omitted`);
  return d.finish();
}

export function brakeDistributionScene({ design }: PreviewContext<'brakes'>) {
  const d = new PreviewDrawing(
    'Brake distribution',
    'Input increments (cm) versus span along the vault (%) · Piecewise linear interpolation.',
  );
  const points = design.brakes.distributionSpans.flatMap((x, i) => {
    const y = design.brakes.distributionIncrements[i];
    return finite(x) && finite(y) ? [{ x, y, index: i }] : [];
  });
  const low = Math.min(0, ...points.map((p) => p.y)),
    high = Math.max(1, ...points.map((p) => p.y));
  const fy = (y: number) => 60 - ((y - low) / (high - low)) * 60;
  const mapped = points.map((p): Point => [p.x, fy(p.y)]);
  d.path(
    [
      [0, fy(0)],
      [100, fy(0)],
    ],
    'baseline',
  );
  d.path(
    [
      [0, 0],
      [0, 60],
    ],
    'baseline',
  );
  points.forEach((p, i) => {
    if (i && p.index === points[i - 1].index + 1)
      d.path([mapped[i - 1], mapped[i]], 'detail', true);
    d.dot(mapped[i], 0.8, `Span ${p.x}% · increment ${p.y} cm`, true);
    d.label([p.x, fy(p.y) - 5], `${valueLabel(p.y)} cm`);
    d.label([p.x, 68], `${valueLabel(p.x)}%`);
  });
  d.label([50, 78], 'Span along vault (%)');
  d.label([-3, 2], `${valueLabel(high)} cm`, 'end');
  d.label([-3, 60], `${valueLabel(low)} cm`, 'end');
  d.frame([
    [0, -10],
    [100, 80],
  ]);
  return d.finish();
}

export function ramificationScene({ design, view }: PreviewContext<'ramifications'>) {
  const four = view.endsWith('4'),
    brake = view.startsWith('brakes');
  const settings = four
    ? brake
      ? design.ramifications.brakes4
      : design.ramifications.lines4
    : brake
      ? design.ramifications.brakes3
      : design.ramifications.lines3;
  const d = new PreviewDrawing(
    `${brake ? 'Brakes' : 'Suspension lines'} · ${four ? 4 : 3} levels`,
    'Distances measured from the canopy to branch junctions (cm). Horizontal layout is schematic.',
  );
  const l2 = settings.l2;
  const l3 = four
    ? brake
      ? design.ramifications.brakes4.l3
      : design.ramifications.lines4.l3
    : null;
  const maximum = Math.max(1, finite(l2) ? Math.abs(l2) : 0, finite(l3) ? Math.abs(l3) : 0);
  const y2 = finite(l2) ? (l2 / maximum) * 100 : 55;
  const y3 = finite(l3) ? (l3 / maximum) * 100 : 25;
  d.path(
    [
      [-50, 0],
      [50, 0],
    ],
    'profile',
  );
  const canopy = [-40, -15, 15, 40].map((x): Point => [x, 0]);
  const junctions: Point[] = four
    ? [
        [-25, y2],
        [25, y2],
      ]
    : [[0, y2]];
  canopy.forEach((p, i) =>
    d.path([p, junctions[four ? Math.floor(i / 2) : 0]], 'connection', true),
  );
  if (four) junctions.forEach((p) => d.path([p, [0, y3]], 'connection', true));
  d.path(
    [
      [0, four ? y3 : y2],
      [0, Math.max(y2, y3, 100) + 30],
    ],
    'connection',
    true,
  );
  const dimension = (x: number, y: number, name: string, value: number | null) => {
    d.path(
      [
        [x, 0],
        [x, y],
      ],
      'dimension',
    );
    d.path(
      [
        [x - 3, 0],
        [x + 3, 0],
      ],
      'dimension',
    );
    d.path(
      [
        [x - 3, y],
        [x + 3, y],
      ],
      'dimension',
    );
    d.label([x + 4, y / 2], `${name} ${valueLabel(value, ' cm')}`, 'start');
  };
  if (four) dimension(55, y3, 'l3', l3);
  dimension(110, y2, 'l2', l2);
  d.label([0, -10], 'Canopy');
  return d.finish();
}
