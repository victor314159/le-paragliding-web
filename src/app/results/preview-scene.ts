import type { Opening, PreviewModel } from '@lepara/views';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import type { PreviewDrawing } from './preview-geometry';

/** The theme colors of a `PreviewModel`, as 0xRRGGBB: its background, skin, lines and highlight. */
export interface ModelColors {
  background: number;
  skin: number;
  line: number;
  selected: number;
}

type Point3 = PreviewModel['dots'][number]['point'];

/**
 * A closed outline without its last point when it repeats the first, to
 * rounding: such near duplicates, as of an ellipse at 0 and 2π, make the
 * triangulation overlap.
 */
function open(points: readonly Point3[]): readonly Point3[] {
  const [first, last] = [points[0], points[points.length - 1]];
  if (points.length < 2) return points;
  const gap = Math.hypot(first[0] - last[0], first[1] - last[1], first[2] - last[2]);
  return gap <= 1e-9 * (1 + Math.hypot(...first)) ? points.slice(0, -1) : points;
}

/**
 * The triangles of a planar polygon with `holes`, concave or not: its
 * vertices, the outline's then the holes', and their indices.
 */
function triangulate(outline: readonly Point3[], holes: readonly (readonly Point3[])[] = []) {
  const rings = [outline, ...holes].map(open);
  // Newell's normal, then the points in two axes of their plane.
  const normal = new THREE.Vector3();
  rings[0].forEach((a, i) => {
    const b = rings[0][(i + 1) % rings[0].length];
    normal.x += (a[1] - b[1]) * (a[2] + b[2]);
    normal.y += (a[2] - b[2]) * (a[0] + b[0]);
    normal.z += (a[0] - b[0]) * (a[1] + b[1]);
  });
  const vertices = rings.flat();
  if (!normal.lengthSq()) return { vertices, faces: [] };
  normal.normalize();
  const reference =
    Math.abs(normal.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(normal, reference).normalize();
  const v = new THREE.Vector3().crossVectors(normal, u);
  const point = new THREE.Vector3();
  const [contour, ...cutouts] = rings.map((ring) =>
    ring.map((p) => new THREE.Vector2(point.set(...p).dot(u), point.dot(v))),
  );
  const faces = THREE.ShapeUtils.triangulateShape(contour, cutouts);
  const shaped = rings.some((ring) => ring.length === 1);
  return { vertices, faces: shaped ? rounded(faces, [contour, ...cutouts].flat()) : faces };
}

/**
 * `faces` with their shared edges flipped until no point lies in a neighbour's circle
 * (Delaunay): a polygon's triangulation joins points inside it in slivers, that shade badly.
 */
function rounded(faces: readonly number[][], points: readonly THREE.Vector2[]) {
  const twice = (a: number, b: number, c: number) =>
    (points[b].x - points[a].x) * (points[c].y - points[a].y) -
    (points[c].x - points[a].x) * (points[b].y - points[a].y);
  // Earcut can leave the bridge to a lone point as a triangle with a vertex twice.
  const wound = faces
    .filter((face) => new Set(face).size === 3)
    .map(([a, b, c]) => (twice(a, b, c) < 0 ? [a, c, b] : [a, b, c]));
  const inCircle = (a: number, b: number, c: number, d: number) => {
    const [ax, ay, bx, by, cx, cy] = [a, b, c].flatMap((i) => [
      points[i].x - points[d].x,
      points[i].y - points[d].y,
    ]);
    const [al, bl, cl] = [ax * ax + ay * ay, bx * bx + by * by, cx * cx + cy * cy];
    return ax * (by * cl - bl * cy) - ay * (bx * cl - bl * cx) + al * (bx * cy - by * cx) > 1e-9;
  };
  for (let flipped = true; flipped;) {
    flipped = false;
    const edges = new Map<string, number>();
    const touched = new Set<number>();
    wound.forEach((_, f) => {
      for (let i = 0; i < 3 && !touched.has(f); i++) {
        const [a, b, c] = [0, 1, 2].map((k) => wound[f][(i + k) % 3]);
        const g = edges.get(`${b}:${a}`);
        if (g === undefined || touched.has(g)) {
          edges.set(`${a}:${b}`, f);
          continue;
        }
        const d = wound[g].find((k) => k !== a && k !== b)!;
        // Flipped only if it stays two triangles the same way round: not folded over.
        if (twice(c, a, d) <= 0 || twice(c, d, b) <= 0 || !inCircle(a, b, c, d)) {
          edges.set(`${a}:${b}`, f);
          continue;
        }
        wound[f] = [c, a, d];
        wound[g] = [c, d, b];
        touched.add(f).add(g);
        flipped = true;
      }
    });
  }
  return wound;
}

/** How strong the table's grid is. */
const GRID_OPACITY = 0.3;

/** The steps of an item's `opening`, in order. */
const stepsOf = <T>({ before, apart, between, flat }: Opening<T>): readonly T[] => [
  ...before,
  apart,
  ...between,
  flat,
];

/** An item's steps, as coordinates, added to those of a geometry's steps. */
function addSteps<T>(
  all: number[][],
  opening: Opening<T> | undefined,
  points: (step: T) => readonly Point3[],
): void {
  if (!opening) return;
  stepsOf(opening).forEach((step, i) => (all[i] ??= []).push(...points(step).flat()));
}

/** Owns all GPU resources for a single dialog; renders only when the view changes. */
export class PreviewScene {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly scene = new THREE.Scene();
  private readonly model = new THREE.Group();
  private readonly orthographic = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100000);
  private readonly perspective = new THREE.PerspectiveCamera();
  private camera: THREE.OrthographicCamera | THREE.PerspectiveCamera = this.orthographic;
  /** How far a fitted camera stands from its target, where both projections agree. */
  private distance = 1;
  private readonly controls: OrbitControls;
  private readonly observer: ResizeObserver;
  private readonly textures: THREE.Texture[] = [];
  /** The materials of the wide lines, drawn at the size of the canvas. */
  private wide: LineMaterial[] = [];
  /** The direction the view looks from on reset, given by the model, in Z-up coordinates. */
  private viewFrom?: { x: number; y: number; z: number };
  /** Half extents of the model on screen at zoom 1, in camera units. */
  private fit = { width: 1, height: 1 };
  private skinCoverage = 100;
  private opening = 0;
  private openingAt: readonly number[] = [1];
  private cutaway: PreviewModel['cutaway'];
  private readonly skinCutUniforms = { edge: { value: 0 }, feather: { value: 1 } };

  constructor(
    private readonly container: HTMLElement,
    background: number,
    label = 'File preview',
    /** Where the camera looks from on reset, in Z-up model coordinates. */
    private readonly direction = { x: 1, y: -1, z: 0.8 },
  ) {
    this.scene.background = new THREE.Color(background);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.setAttribute('aria-label', label);
    this.renderer.domElement.setAttribute('role', 'img');
    container.append(this.renderer.domElement);
    this.scene.add(this.model, new THREE.HemisphereLight(0xffffff, 0x65776a, 3));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(1, -1, 2);
    this.scene.add(light);
    // OrbitControls captures the camera's up axis in its constructor.
    // All 3D previews use Z-up, including after resetting the view.
    this.orthographic.up.set(0, 0, 1);
    this.perspective.up.set(0, 0, 1);
    this.orthographic.position.z = this.distance;
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.cursorStyle = 'grab';
    this.controls.addEventListener('change', this.render);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
  }

  loadStl(bytes: ArrayBuffer): void {
    const geometry = new STLLoader().parse(bytes);
    const points = geometry.getAttribute('position');
    if (!points?.count || !Array.from(points.array).every(Number.isFinite)) {
      geometry.dispose();
      throw new Error('This STL contains no valid surface.');
    }
    geometry.computeVertexNormals();
    this.model.add(
      new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: 0x579e7f, side: THREE.DoubleSide, roughness: 0.7 }),
      ),
    );
    this.reset();
  }

  loadDrawing(drawing: PreviewDrawing): void {
    if (!drawing.positions.length) throw new Error('This DXF contains no supported geometry.');
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(drawing.positions, 3));
    // DXF palette values are sRGB; vertex attributes use Three.js's linear space.
    const color = new THREE.Color();
    for (let i = 0; i < drawing.colors.length; i += 3) {
      color.setRGB(
        drawing.colors[i],
        drawing.colors[i + 1],
        drawing.colors[i + 2],
        THREE.SRGBColorSpace,
      );
      drawing.colors.set([color.r, color.g, color.b], i);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(drawing.colors, 3));
    this.model.add(
      new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true })),
    );
    for (const label of drawing.labels) {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) continue;
      context.font = '32px monospace';
      canvas.width = Math.min(4096, Math.ceil(context.measureText(label.text).width) + 8);
      canvas.height = 48;
      context.font = '32px monospace';
      context.fillStyle = `#${label.color.toString(16).padStart(6, '0')}`;
      context.fillText(label.text, 4, 36, canvas.width - 8);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.textures.push(texture);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: texture, rotation: label.rotation, depthTest: false }),
      );
      sprite.position.set(...label.position);
      sprite.center.set(0, 0);
      sprite.scale.set((label.height * canvas.width) / 32, (label.height * 48) / 32, 1);
      this.model.add(sprite);
    }
    // LEparagliding's DXFs retain its Z-down coordinates. STL export already
    // negates Z (Fortran section 21.13), so normalize only the DXF preview.
    this.model.scale.z = -1;
    this.reset();
  }

  /**
   * Replaces the model with `model`, keeping the view unless `fit`. The
   * selected lines and surfaces are drawn over the others, so that a rib
   * inside the wing shows through its skin; selected lines are wider, in
   * their own color or else the highlight.
   */
  loadModel(model: PreviewModel, colors: ModelColors, fit: boolean): void {
    this.clear();
    this.cutaway = model.cutaway;
    this.updateSkinCut();
    this.scene.background = new THREE.Color(colors.background);
    for (const selected of [false, true])
      for (const cutaway of [false, true]) {
        const kind = (item: { kind: string; cutaway?: boolean }) =>
          (item.kind === 'selected') === selected && !!item.cutaway === cutaway;
        // The skin, or the selected surfaces, then each color drawn over the skin.
        const groups = selected
          ? [
              {
                color: undefined,
                fills: model.fills.filter(kind),
                surfaces: model.surfaces.filter(kind),
              },
            ]
          : [
              undefined,
              ...new Set(
                [...model.surfaces, ...model.fills].flatMap((s) => (s.color ? [s.color] : [])),
              ),
            ].map((color) => ({
              color,
              fills: model.fills.filter((f) => kind(f) && f.color === color),
              surfaces: model.surfaces.filter((s) => kind(s) && s.color === color),
            }));
        for (const { color, fills, surfaces } of groups) {
          const positions: number[] = [];
          const indices: number[] = [];
          const steps: number[][] = [];
          for (const fill of fills) {
            const start = positions.length / 3;
            // On its pattern if it has one: in space, a piece can fold over its own outline.
            const flat = fill.opening?.flat;
            const { faces } = triangulate(flat?.[0] ?? fill.points, flat?.slice(1) ?? fill.holes);
            for (const point of [fill.points, ...(fill.holes ?? [])].flatMap(open))
              positions.push(...point);
            for (const face of faces) indices.push(...face.map((i) => start + i));
            addSteps(steps, fill.opening, (rings) => rings.flatMap(open));
          }
          for (const { rows } of surfaces) {
            const width = rows[0].length;
            const start = positions.length / 3;
            for (const row of rows) for (const point of row) positions.push(...point);
            for (let r = 1; r < rows.length; r++)
              for (let k = 1; k < width; k++) {
                const a = start + (r - 1) * width + k - 1;
                const b = a + width;
                indices.push(a, b, a + 1, a + 1, b, b + 1);
              }
          }
          for (const { opening } of surfaces) addSteps(steps, opening, (rows) => rows.flat());
          if (!indices.length) continue;
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
          geometry.setIndex(indices);
          geometry.computeVertexNormals();
          if (steps.length) this.addOpening(geometry, steps, indices);
          // Pieces in their own color keep their seams in front of them.
          const over = color && ![...fills, ...surfaces].some((item) => item.opening);
          const material = selected
            ? new THREE.MeshBasicMaterial({
                color: colors.selected,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.6,
                depthTest: false,
              })
            : // The skin pushed back, so that the ribs on its edges stay visible, and the
              // colors pulled forward, over it.
              new THREE.MeshStandardMaterial({
                color: color ?? colors.skin,
                side: THREE.DoubleSide,
                roughness: 0.8,
                polygonOffset: true,
                polygonOffsetFactor: over ? -1 : 1,
                polygonOffsetUnits: over ? -1 : 1,
              });
          let materials: THREE.Material | THREE.Material[] = material;
          if (cutaway && !selected) {
            // Fully covered fabric writes depth like any opaque surface. Only the
            // feather blends, so camera sorting cannot erase colors behind the skin.
            const opaque = material.clone();
            this.applySkinCut(opaque, true, 'opaque');
            this.applySkinCut(material, true, 'feather');
            geometry.addGroup(0, indices.length, 0);
            geometry.addGroup(0, indices.length, 1);
            materials = [opaque, material];
            // The feather's depth first, of every color: only its nearest fabric blends,
            // not a color behind it, drawn later, over it.
            const depth = material.clone();
            depth.colorWrite = false;
            this.applySkinCut(depth, true, 'depth');
            this.model.add(new THREE.Mesh(geometry, depth));
          } else this.applySkinCut(material, cutaway);
          const mesh = new THREE.Mesh(geometry, materials);
          // Coplanar colored patches must blend after the neutral fabric at the cut.
          mesh.renderOrder = cutaway ? (color ? 2 : 1) : selected ? 1 : 0;
          this.model.add(mesh);
        }
        const segments: number[] = [];
        const segmentSteps: number[][] = [];
        const segmentColors: number[] = [];
        const color = new THREE.Color();
        for (const line of model.lines.filter(
          (l) => l.selected === selected && !!l.cutaway === cutaway,
        )) {
          color.set(line.color ?? (selected ? colors.selected : colors.line));
          for (let i = 1; i < line.points.length; i++) {
            segments.push(...line.points[i - 1], ...line.points[i]);
            segmentColors.push(color.r, color.g, color.b, color.r, color.g, color.b);
            addSteps(segmentSteps, line.opening, (step) => [step[i - 1], step[i]]);
          }
        }
        if (segments.length && selected) {
          // WebGL lines are a pixel wide: the selected ones are wide lines, in pixels, of
          // quads that the model's mirrored Z turns over.
          const material = new LineMaterial({
            vertexColors: true,
            linewidth: 2.5,
            depthTest: false,
            side: THREE.DoubleSide,
          });
          material.resolution.set(this.container.clientWidth, this.container.clientHeight);
          this.wide.push(material);
          const lines = new LineSegments2(
            new LineSegmentsGeometry().setPositions(segments).setColors(segmentColors),
            material,
          );
          lines.renderOrder = 2;
          this.model.add(lines);
        } else if (segments.length) {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(segments, 3));
          geometry.setAttribute('color', new THREE.Float32BufferAttribute(segmentColors, 3));
          if (segmentSteps.length) this.addOpening(geometry, segmentSteps);
          const material = new THREE.LineBasicMaterial({ vertexColors: true });
          this.applySkinCut(material, cutaway);
          const lines = new THREE.LineSegments(geometry, material);
          lines.renderOrder = cutaway ? 2 : 0;
          this.model.add(lines);
        }
        const dots = model.dots.filter((d) => d.selected === selected && !!d.cutaway === cutaway);
        if (dots.length) {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(
              dots.flatMap((d) => d.point),
              3,
            ),
          );
          geometry.setAttribute(
            'color',
            new THREE.Float32BufferAttribute(
              dots.flatMap((d) => color.set(d.color ?? colors.line).toArray()),
              3,
            ),
          );
          const points = new THREE.Points(
            geometry,
            // Round dots of a constant size on screen, the selected rib's larger.
            new THREE.PointsMaterial({
              size: selected ? 9 : 5,
              sizeAttenuation: false,
              vertexColors: true,
              map: this.disc(),
              alphaTest: 0.5,
              depthTest: !selected,
            }),
          );
          if (dots.some((d) => d.opening)) {
            const steps: number[][] = [];
            for (const { opening } of dots) addSteps(steps, opening, (step) => [step]);
            this.addOpening(geometry, steps);
            points.updateMorphTargets();
          }
          this.applySkinCut(points.material, cutaway);
          points.renderOrder = selected || cutaway ? 3 : 0;
          this.model.add(points);
        }
      }
    // Like the engine's DXFs, models are in Z-down coordinates.
    this.model.scale.z = -1;
    this.viewFrom = model.camera && { x: model.camera[0], y: model.camera[1], z: -model.camera[2] };
    this.openingAt = model.openingAt ?? this.openingAt;
    this.addGrid(model.grid?.lines, colors.line);
    this.applyOpening();
    if (fit && this.model.children.length) this.reset();
    this.render();
  }

  /** The table's grid, under the model. */
  private addGrid(lines: readonly Point3[] | undefined, color: number): void {
    if (!lines) return;
    const geometry = new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(lines.flat(), 3),
    );
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: GRID_OPACITY,
      depthWrite: false,
    });
    this.model.add(new THREE.LineSegments(geometry, material));
  }

  /** The steps of a model's `opening`, as morph targets, with their normals on a mesh. */
  private addOpening(
    geometry: THREE.BufferGeometry,
    steps: readonly number[][],
    indices?: readonly number[],
  ): void {
    const targets = steps.map((step) => new THREE.Float32BufferAttribute(step, 3));
    geometry.morphAttributes['position'] = targets;
    if (!indices) return;
    geometry.morphAttributes['normal'] = targets.map((target) => {
      const shape = new THREE.BufferGeometry();
      shape.setAttribute('position', target);
      shape.setIndex([...indices]);
      shape.computeVertexNormals();
      return shape.getAttribute('normal');
    });
  }

  /** Open the pieces, from 0 in place through the model's steps to 1, without rebuilding them. */
  setOpening(value: number): void {
    this.opening = Math.min(1, Math.max(0, value));
    this.applyOpening();
    this.render();
  }

  private applyOpening(): void {
    // Between two steps, the first of them being the model as it stands.
    const at = [0, ...this.openingAt];
    let step = 0;
    while (step < at.length - 2 && at[step + 1] < this.opening) step++;
    const t = (this.opening - at[step]) / (at[step + 1] - at[step]);
    this.model.traverse((object) => {
      const { morphTargetInfluences: current } = object as Partial<THREE.Mesh>;
      if (!current) return;
      current.fill(0);
      if (step) current[step - 1] = 1 - t;
      current[step] = t;
    });
  }

  /** Move only the skin's dissolved cut edge; its internals and the camera are unchanged. */
  setSkinCoverage(value: number): void {
    this.skinCoverage = Math.min(100, Math.max(0, value));
    this.updateSkinCut();
    this.render();
  }

  private updateSkinCut(): void {
    if (!this.cutaway) return;
    const { min, max, feather } = this.cutaway;
    this.skinCutUniforms.edge.value = min + ((max - min + feather) * this.skinCoverage) / 100;
    this.skinCutUniforms.feather.value = feather;
  }

  /** Smooth transparency falloff across the cut plane. */
  private applySkinCut(
    material: THREE.Material,
    enabled: boolean,
    pass: 'opaque' | 'feather' | 'depth' | 'all' = 'all',
  ): void {
    if (!enabled || !this.cutaway) return;
    material.transparent = pass !== 'opaque';
    material.depthWrite = pass === 'opaque' || pass === 'depth';
    material.customProgramCacheKey = () => `skin-cutaway-${pass}`;
    material.onBeforeCompile = (shader) => {
      shader.uniforms['uSkinEdge'] = this.skinCutUniforms.edge;
      shader.uniforms['uSkinFeather'] = this.skinCutUniforms.feather;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vSkinX;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkinX = position.x;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying float vSkinX;
          uniform float uSkinEdge;
          uniform float uSkinFeather;`,
        )
        .replace(
          '#include <alphatest_fragment>',
          `
          ${pass === 'opaque' ? 'if (vSkinX > uSkinEdge - uSkinFeather) discard;' : ''}
          ${pass === 'feather' || pass === 'depth' ? 'if (vSkinX <= uSkinEdge - uSkinFeather) discard;' : ''}
          diffuseColor.a *= 1.0 - smoothstep(uSkinEdge - uSkinFeather, uSkinEdge, vSkinX);
          if (diffuseColor.a < 0.001) discard;
          #include <alphatest_fragment>`,
        );
    };
  }

  /** A white disc, the shape of the dots of a model. */
  private disc(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fff';
    context.beginPath();
    context.arc(16, 16, 15, 0, 2 * Math.PI);
    context.fill();
    const texture = new THREE.CanvasTexture(canvas);
    this.textures.push(texture);
    return texture;
  }

  reset(): void {
    const bounds = new THREE.Box3().setFromObject(this.model);
    const center = bounds.getCenter(new THREE.Vector3());
    const radius = Math.max(bounds.getSize(new THREE.Vector3()).length() / 2, 0.01);
    const { x, y, z } = this.viewFrom ?? this.direction;
    const direction = new THREE.Vector3(x, y, z).normalize();
    this.distance = radius * 3;
    this.camera.position.copy(center).addScaledVector(direction, this.distance);
    this.orthographic.near = radius / 1000;
    this.orthographic.far = radius * 10;
    this.perspective.near = radius / 100;
    this.perspective.far = radius * 100;
    this.camera.zoom = 1;
    this.controls.target.copy(center);
    this.controls.update();
    // Frame the model's points as seen from the camera, not its bounding sphere.
    const view = this.viewBounds();
    const offset = view.getCenter(new THREE.Vector3()).setZ(0);
    offset.applyQuaternion(this.camera.quaternion);
    this.camera.position.add(offset);
    this.controls.target.add(offset);
    this.controls.update();
    const size = view.getSize(new THREE.Vector3()).multiplyScalar(0.55);
    this.fit = { width: Math.max(size.x, 0.01), height: Math.max(size.y, 0.01) };
    this.resize();
  }

  /** Show the model in perspective or orthographic, from the same place and at the same scale. */
  setProjection(perspective: boolean): void {
    const next = perspective ? this.perspective : this.orthographic;
    if (next === this.camera) return;
    const { target } = this.controls;
    const offset = this.camera.position.clone().sub(target);
    // An orthographic camera zooms at a constant distance, a perspective one moves.
    const zoom = (this.camera.zoom * this.distance) / offset.length();
    next.zoom = perspective ? 1 : zoom;
    offset.setLength(perspective ? this.distance / zoom : this.distance);
    next.position.copy(target).add(offset);
    this.camera = this.controls.object = next;
    this.controls.update();
    this.resize();
  }

  /** Bounds of the model's points in camera space, at the target's scale in perspective. */
  private viewBounds(): THREE.Box3 {
    this.model.updateMatrixWorld(true);
    this.camera.updateMatrixWorld();
    const bounds = new THREE.Box3();
    const point = new THREE.Vector3();
    const add = (toView: THREE.Matrix4) => {
      point.applyMatrix4(toView);
      if (this.camera === this.perspective) point.multiplyScalar(this.distance / -point.z);
      bounds.expandByPoint(point);
    };
    this.model.traverse((object) => {
      const toView = new THREE.Matrix4().multiplyMatrices(
        this.camera.matrixWorldInverse,
        object.matrixWorld,
      );
      if (object instanceof THREE.Sprite) {
        point.set(0, 0, 0);
        add(toView);
        return;
      }
      // Their positions are those of a quad; the model's other points frame them.
      if (object instanceof LineSegments2) return;
      const { geometry } = object as Partial<THREE.Mesh>;
      const positions = geometry?.getAttribute('position');
      if (!positions) return;
      // An opening's steps too: the view holds the pieces all the way.
      for (const step of [positions, ...(geometry!.morphAttributes['position'] ?? [])])
        for (let i = 0; i < step.count; i++) {
          point.fromBufferAttribute(step, i);
          add(toView);
        }
    });
    return bounds;
  }

  dispose(): void {
    this.observer.disconnect();
    this.controls.dispose();
    this.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  /** Removes the model and frees its resources. */
  private clear(): void {
    this.model.traverse((object) => {
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.Line ||
        object instanceof THREE.Points ||
        object instanceof THREE.Sprite
      ) {
        const primitive = object as THREE.Mesh<
          THREE.BufferGeometry,
          THREE.Material | THREE.Material[]
        >;
        primitive.geometry.dispose();
        const materials = Array.isArray(primitive.material)
          ? primitive.material
          : [primitive.material];
        for (const material of materials) material.dispose();
      }
    });
    for (const texture of this.textures.splice(0)) texture.dispose();
    this.wide = [];
    this.model.clear();
  }

  private resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height) return;
    const aspect = width / height;
    const top = Math.max(this.fit.height, this.fit.width / aspect);
    this.orthographic.top = top;
    this.orthographic.bottom = -top;
    this.orthographic.right = top * aspect;
    this.orthographic.left = -this.orthographic.right;
    this.perspective.aspect = aspect;
    this.perspective.fov = THREE.MathUtils.radToDeg(2 * Math.atan(top / this.distance));
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    for (const material of this.wide) material.resolution.set(width, height);
    this.render();
  }

  private readonly render = (): void => {
    this.renderer.render(this.scene, this.camera);
  };
}
