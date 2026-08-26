import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Engine } from '@babylonjs/core/Engines/engine';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4, Vector3 } from '@babylonjs/core/Maths/math';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Scene } from '@babylonjs/core/scene';
import '@babylonjs/core/Culling/ray';
import { useGameStore } from '../state/store';

/** Entity id shared between the scene, the store, and (later) the engine/UI. */
export const DEMO_CRATE_ID = 'entity:demo-crate';

/**
 * Walking-skeleton scene (backlog #16): fixed 3/4 isometric-style camera,
 * warm ground, one pickable crate. Proves the Babylon↔Zustand↔React loop.
 */
export function createScene(engine: Engine, canvas: HTMLCanvasElement): Scene {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.96, 0.94, 0.89, 1);

  // 3/4 isometric-style rig: fixed angles, small zoom range, no free orbit (§11).
  const camera = new ArcRotateCamera(
    'iso-camera',
    -Math.PI / 4,
    Math.PI / 3.2,
    14,
    Vector3.Zero(),
    scene,
  );
  camera.lowerRadiusLimit = 10;
  camera.upperRadiusLimit = 18;
  camera.lowerAlphaLimit = camera.upperAlphaLimit = camera.alpha;
  camera.lowerBetaLimit = camera.upperBetaLimit = camera.beta;
  camera.attachControl(canvas, true);
  camera.wheelPrecision = 40;

  const light = new HemisphericLight('daylight', new Vector3(-0.3, 1, 0.4), scene);
  light.intensity = 1.1;
  light.groundColor = new Color3(0.55, 0.5, 0.42);

  const ground = MeshBuilder.CreateGround('ground', { width: 16, height: 16 }, scene);
  const groundMat = new StandardMaterial('ground-mat', scene);
  groundMat.diffuseColor = new Color3(0.85, 0.78, 0.64);
  groundMat.specularColor = Color3.Black();
  ground.material = groundMat;

  const crate = MeshBuilder.CreateBox(DEMO_CRATE_ID, { size: 1.6 }, scene);
  crate.position.y = 0.8;
  const crateMat = new StandardMaterial('crate-mat', scene);
  crateMat.diffuseColor = new Color3(0.78, 0.45, 0.28);
  crateMat.specularColor = Color3.Black();
  crate.material = crateMat;

  // World → store: picking the crate selects its entity.
  scene.onPointerDown = () => {
    const pick = scene.pick(scene.pointerX, scene.pointerY);
    useGameStore
      .getState()
      .selectEntity(pick?.pickedMesh?.name === DEMO_CRATE_ID ? DEMO_CRATE_ID : null);
  };

  // Store → world: selection tints the crate with the cool semantic accent (§10.3);
  // a pulse from the React overlay makes it hop.
  let pulseT = 0;
  useGameStore.subscribe((state, prev) => {
    if (state.selectedEntityId !== prev.selectedEntityId) {
      crateMat.emissiveColor =
        state.selectedEntityId === DEMO_CRATE_ID ? new Color3(0.15, 0.35, 0.5) : Color3.Black();
    }
    if (state.pulseCount !== prev.pulseCount) {
      pulseT = 1;
    }
  });

  scene.onBeforeRenderObservable.add(() => {
    if (pulseT > 0) {
      const dt = engine.getDeltaTime() / 1000;
      crate.position.y = 0.8 + Math.sin((1 - pulseT) * Math.PI) * 0.9;
      pulseT = Math.max(0, pulseT - dt * 2);
    }
  });

  return scene;
}
