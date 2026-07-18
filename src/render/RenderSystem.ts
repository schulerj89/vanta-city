import { PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer } from 'three';
import type { GameSystem } from '../core/lifecycle';
import type { PerformanceTimingSummary } from '../game/GameRuntime';

export type RendererTimingSnapshot =
  | { readonly enabled: false }
  | ({ readonly enabled: true } & PerformanceTimingSummary);

export interface RendererTimingDiagnostics {
  now(): number;
  record(durationMs: number): void;
  getSnapshot(): RendererTimingSnapshot;
  reset(): void;
}

export interface RendererPerformanceSnapshot {
  readonly frameTime: RendererTimingSnapshot;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
  readonly pixelRatio: number;
  readonly viewport: {
    readonly cssWidth: number;
    readonly cssHeight: number;
    readonly bufferWidth: number;
    readonly bufferHeight: number;
  };
}

export class RenderSystem implements GameSystem {
  public readonly id = 'render';
  public readonly updateMode = 'always' as const;
  public readonly scene = new Scene();
  public readonly camera = new PerspectiveCamera(60, 1, 0.1, 1000);
  public readonly renderer: WebGLRenderer;

  private readonly resizeObserver: ResizeObserver;
  private diagnostics: RendererTimingDiagnostics | undefined;

  public constructor(private readonly mount: HTMLElement) {
    this.renderer = new WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.domElement.className = 'game-render-canvas';
    this.resizeObserver = new ResizeObserver(() => this.resize());
  }

  public init(): void {
    this.camera.position.set(10, 9, 14);
    this.camera.lookAt(0, 1, 0);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.mount.append(this.renderer.domElement);
    this.resizeObserver.observe(this.mount);
    this.resize();
  }

  public update(): void {
    const diagnostics = this.diagnostics;
    if (diagnostics) {
      const started = diagnostics.now();
      this.renderer.render(this.scene, this.camera);
      diagnostics.record(diagnostics.now() - started);
      return;
    }
    this.renderer.render(this.scene, this.camera);
  }

  public setPerformanceDiagnostics(
    diagnostics?: RendererTimingDiagnostics,
  ): void {
    this.diagnostics = diagnostics;
  }

  public getPerformanceSnapshot(): RendererPerformanceSnapshot {
    const canvas = this.renderer.domElement;
    return {
      frameTime: this.diagnostics?.getSnapshot() ?? { enabled: false },
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      pixelRatio: this.renderer.getPixelRatio(),
      viewport: {
        cssWidth: this.mount.clientWidth,
        cssHeight: this.mount.clientHeight,
        bufferWidth: canvas.width,
        bufferHeight: canvas.height,
      },
    };
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
