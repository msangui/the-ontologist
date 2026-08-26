import { Engine } from '@babylonjs/core/Engines/engine';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadAutosave } from './case/persistence';
import { createScene, type SceneApi } from './scene/createScene';
import { hydrateFromSnapshot, useGameStore } from './state/store';
import { App } from './ui/App';

declare global {
  interface Window {
    /** Readiness + debug hooks for Playwright (backlog #18). */
    __ontologist?: {
      ready: boolean;
      webgl2: boolean;
      getState: () => unknown;
      debug: {
        teleportTo: (entityId: string) => boolean;
        getPlayerPosition: () => { x: number; z: number };
      };
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

async function bootstrap(): Promise<void> {
  const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
  const overlayRoot = document.getElementById('overlay-root') as HTMLElement;

  const webgl2 = supportsWebGL2();
  let sceneApi: SceneApi = {
    teleportTo: () => false,
    getPlayerPosition: () => ({ x: 0, z: 0 }),
  };
  window.__ontologist = {
    ready: false,
    webgl2,
    getState: () => useGameStore.getState(),
    debug: {
      teleportTo: (id) => sceneApi.teleportTo(id),
      getPlayerPosition: () => sceneApi.getPlayerPosition(),
    },
  };

  if (!webgl2) {
    // WebGL2 only through MVP [I7-D3]: a friendly message, never a crash.
    showFallback(overlayRoot);
    return;
  }

  const engine = new Engine(canvas, true, { adaptToDeviceRatio: true });
  sceneApi = createScene(engine, canvas);
  window.addEventListener('resize', () => engine.resize());

  createRoot(overlayRoot).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

  // Resume the autosave, if any — after the scene subscribes, so the world
  // reacts to the restored state (statuses, wave-2 visibility).
  const saved = await loadAutosave();
  if (saved) hydrateFromSnapshot(saved);

  window.__ontologist.ready = true;
}

void bootstrap();
