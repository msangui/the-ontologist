import { Engine } from '@babylonjs/core/Engines/engine';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AssertionLog } from '@ontologist/semantic-engine';
import { createScene } from './scene/createScene';
import { useGameStore } from './state/store';
import { App } from './ui/App';

declare global {
  interface Window {
    /** Readiness + state hook for Playwright (backlog #18). Read-only in spirit. */
    __ontologist?: {
      ready: boolean;
      webgl2: boolean;
      getState: () => unknown;
    };
  }
}

function supportsWebGL2(): boolean {
  // Probe on a throwaway canvas so Babylon acquires the real one cleanly.
  return document.createElement('canvas').getContext('webgl2') !== null;
}

function showFallback(overlayRoot: HTMLElement): void {
  overlayRoot.style.pointerEvents = 'auto';
  overlayRoot.innerHTML = `
    <div style="max-width: 32rem; margin: 20vh auto; padding: 1.5rem; font-size: 1rem;
                background: #fffcf5; border: 1px solid rgba(90,70,50,.25); border-radius: 10px;">
      <strong>The Last Ontologist needs WebGL2.</strong>
      <p>Your browser doesn't support WebGL2, which this game requires.
      Please try a current version of Chrome, Edge, Firefox, or Safari on a desktop or laptop.</p>
    </div>`;
}

function bootstrap(): void {
  const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
  const overlayRoot = document.getElementById('overlay-root') as HTMLElement;

  const webgl2 = supportsWebGL2();
  window.__ontologist = {
    ready: false,
    webgl2,
    getState: () => useGameStore.getState(),
  };

  if (!webgl2) {
    // WebGL2 only through MVP [I7-D3]: a friendly message, never a crash.
    showFallback(overlayRoot);
    return;
  }

  // Sanity round-trip through the semantic engine package: the boundary works.
  const log = new AssertionLog();
  log.assert({
    id: 'boot:hello',
    subject: 'game:client',
    predicate: 'bootedWith',
    object: 'webgl2',
    truth: 'true',
    provenance: { kind: 'scenario' },
  });

  const engine = new Engine(canvas, true, { adaptToDeviceRatio: true });
  const scene = createScene(engine, canvas);
  engine.runRenderLoop(() => scene.render());
  window.addEventListener('resize', () => engine.resize());

  createRoot(overlayRoot).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

  window.__ontologist.ready = true;
}

bootstrap();
