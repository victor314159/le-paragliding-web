import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import type { PreviewDrawing } from './preview-geometry';

/** Owns all GPU resources for a single dialog; renders only when the view changes. */
export class PreviewScene {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly scene = new THREE.Scene();
  private readonly model = new THREE.Group();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100000);
  private readonly controls: OrbitControls;
  private readonly observer: ResizeObserver;
  private readonly textures: THREE.Texture[] = [];

  constructor(
    private readonly container: HTMLElement,
    background: number,
  ) {
    this.scene.background = new THREE.Color(background);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.setAttribute('aria-label', 'File preview');
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

  reset(): void {
    const bounds = new THREE.Box3().setFromObject(this.model);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 0.01);
    const direction = new THREE.Vector3(1, -1, 0.8).normalize();
    this.camera.position.copy(center).addScaledVector(direction, radius * 3);
    this.camera.near = radius / 1000;
    this.camera.far = radius * 10;
    this.camera.zoom = 1;
    this.controls.target.copy(center);
    const halfHeight = radius * 1.15;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.controls.update();
    this.resize();
  }

  dispose(): void {
    this.observer.disconnect();
    this.controls.dispose();
    this.model.traverse((object) => {
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.Line ||
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
    for (const texture of this.textures) texture.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  private resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height) return;
    this.camera.right = (this.camera.top * width) / height;
    this.camera.left = -this.camera.right;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.render();
  }

  private readonly render = (): void => {
    this.renderer.render(this.scene, this.camera);
  };
}
