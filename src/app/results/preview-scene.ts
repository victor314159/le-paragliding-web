import type { PreviewModel } from '@lepara/views';
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
  return { vertices, faces: THREE.ShapeUtils.triangulateShape(contour, cutouts) };
}

/** Owns all GPU resources for a single dialog; renders only when the view changes. */
export class PreviewScene {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly scene = new THREE.Scene();
  private readonly model = new THREE.Group();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100000);
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
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
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
          : [undefined, ...new Set(model.surfaces.flatMap((s) => (s.color ? [s.color] : [])))].map(
              (color) => ({
                color,
                fills: color ? [] : model.fills.filter(kind),
                surfaces: model.surfaces.filter((s) => kind(s) && s.color === color),
              }),
            );
        for (const { color, fills, surfaces } of groups) {
          const positions: number[] = [];
          const indices: number[] = [];
          for (const fill of fills) {
            const start = positions.length / 3;
            const { vertices, faces } = triangulate(fill.points, fill.holes);
            for (const point of vertices) positions.push(...point);
            for (const face of faces) indices.push(...face.map((i) => start + i));
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
          if (!indices.length) continue;
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
          geometry.setIndex(indices);
          geometry.computeVertexNormals();
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
                polygonOffsetFactor: color ? -1 : 1,
                polygonOffsetUnits: color ? -1 : 1,
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
          } else this.applySkinCut(material, cutaway);
          const mesh = new THREE.Mesh(geometry, materials);
          // Coplanar colored patches must blend after the neutral fabric at the cut.
          mesh.renderOrder = cutaway ? (color ? 2 : 1) : selected ? 1 : 0;
          this.model.add(mesh);
        }
        const segments: number[] = [];
        const segmentColors: number[] = [];
        const color = new THREE.Color();
        for (const line of model.lines.filter(
          (l) => l.selected === selected && !!l.cutaway === cutaway,
        )) {
          color.set(line.color ?? (selected ? colors.selected : colors.line));
          for (let i = 1; i < line.points.length; i++) {
            segments.push(...line.points[i - 1], ...line.points[i]);
            segmentColors.push(color.r, color.g, color.b, color.r, color.g, color.b);
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
          this.applySkinCut(points.material, cutaway);
          points.renderOrder = selected || cutaway ? 3 : 0;
          this.model.add(points);
        }
      }
    // Like the engine's DXFs, models are in Z-down coordinates.
    this.model.scale.z = -1;
    this.viewFrom = model.camera && { x: model.camera[0], y: model.camera[1], z: -model.camera[2] };
    if (fit && this.model.children.length) this.reset();
    else this.render();
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
    pass: 'opaque' | 'feather' | 'all' = 'all',
  ): void {
    if (!enabled || !this.cutaway) return;
    material.transparent = pass !== 'opaque';
    material.depthWrite = pass === 'opaque';
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
          ${pass === 'feather' ? 'if (vSkinX <= uSkinEdge - uSkinFeather) discard;' : ''}
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
    this.camera.position.copy(center).addScaledVector(direction, radius * 3);
    this.camera.near = radius / 1000;
    this.camera.far = radius * 10;
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

  /** Bounds of the model's points in camera space. */
  private viewBounds(): THREE.Box3 {
    this.model.updateMatrixWorld(true);
    this.camera.updateMatrixWorld();
    const bounds = new THREE.Box3();
    const point = new THREE.Vector3();
    this.model.traverse((object) => {
      const toView = new THREE.Matrix4().multiplyMatrices(
        this.camera.matrixWorldInverse,
        object.matrixWorld,
      );
      if (object instanceof THREE.Sprite) {
        bounds.expandByPoint(point.set(0, 0, 0).applyMatrix4(toView));
        return;
      }
      // Their positions are those of a quad; the model's other points frame them.
      if (object instanceof LineSegments2) return;
      const positions = (object as Partial<THREE.Mesh>).geometry?.getAttribute('position');
      if (!positions) return;
      for (let i = 0; i < positions.count; i++)
        bounds.expandByPoint(point.fromBufferAttribute(positions, i).applyMatrix4(toView));
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
    this.camera.top = Math.max(this.fit.height, this.fit.width / aspect);
    this.camera.bottom = -this.camera.top;
    this.camera.right = this.camera.top * aspect;
    this.camera.left = -this.camera.right;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    for (const material of this.wide) material.resolution.set(width, height);
    this.render();
  }

  private readonly render = (): void => {
    this.renderer.render(this.scene, this.camera);
  };
}
