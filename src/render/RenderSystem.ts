import {
  Color,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import type { GameSystem } from '../core/lifecycle';

export class RenderSystem implements GameSystem {
  public readonly id = 'render';
  public readonly updateMode = 'always' as const;
  public readonly scene = new Scene();
  public readonly camera = new PerspectiveCamera(60, 1, 0.1, 1000);
  public readonly renderer: WebGLRenderer;

  private readonly resizeObserver: ResizeObserver;

  public constructor(private readonly mount: HTMLElement) {
    this.renderer = new WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
  }

  public init(): void {
    this.scene.background = new Color(0x92a8b8);
    this.camera.position.set(10, 9, 14);
    this.camera.lookAt(0, 1, 0);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.mount.append(this.renderer.domElement);
    this.resizeObserver.observe(this.mount);
    this.resize();
  }

  public update(): void {
    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    this.resizeObserver.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private resize(): void {
    const width = Math.max(1, this.mount.clientWidth);
    const height = Math.max(1, this.mount.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
}
