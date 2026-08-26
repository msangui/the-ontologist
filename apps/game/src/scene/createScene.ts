import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Engine } from '@babylonjs/core/Engines/engine';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Color3, Color4, Vector3 } from '@babylonjs/core/Maths/math';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Scene } from '@babylonjs/core/scene';
import '@babylonjs/core/Culling/ray';
import { ENTITIES, type ProtoEntity } from '../case/protoCase';
import { useGameStore } from '../state/store';
import type { ProductStatus } from '../case/session';

/**
 * Proto-FreshMart greybox (backlog #16 → first steps of #39/#40/#41/#43):
 * a walkable store corner where scannables are placed from case data, the
 * nearest one highlights, and product materials react to the engine's verdict
 * (affected / uncertain / safe) — inference as a visible world change.
 */

export interface SceneApi {
  /** Test/debug hook: drop the player next to a scannable (e2e uses this). */
  teleportTo: (entityId: string) => boolean;
}

const SCAN_RANGE = 2.4;
const BOUNDS = { x: 8.4, z: 5.4 } as const;
const WORLD = {
  ground: new Color3(0.85, 0.78, 0.64),
  shelf: new Color3(0.62, 0.55, 0.45),
  desk: new Color3(0.55, 0.46, 0.36),
  product: new Color3(0.78, 0.62, 0.4),
  document: new Color3(0.93, 0.9, 0.8),
  player: new Color3(0.35, 0.42, 0.52),
} as const;
/** Semantic verdict colors — dual-encoded in the UI, color is not alone (§10.4). */
const STATUS_EMISSIVE: Record<ProductStatus, Color3> = {
  pending: Color3.Black(),
  affected: new Color3(0.45, 0.1, 0.08),
  uncertain: new Color3(0.4, 0.3, 0.05),
  safe: new Color3(0.08, 0.3, 0.14),
};

function makeLabel(scene: Scene, entity: ProtoEntity, y: number): void {
  const texture = new DynamicTexture(`label-tex:${entity.id}`, { width: 512, height: 128 }, scene);
  texture.hasAlpha = true;
  texture.drawText(
    entity.label,
    null,
    86,
    'bold 56px system-ui, sans-serif',
    '#4a3b2a',
    'transparent',
    true,
  );
  const material = new StandardMaterial(`label-mat:${entity.id}`, scene);
  material.diffuseTexture = texture;
  material.emissiveColor = Color3.White();
  material.specularColor = Color3.Black();
  material.useAlphaFromDiffuseTexture = true;
  material.backFaceCulling = false;

  const plane = MeshBuilder.CreatePlane(`label:${entity.id}`, { width: 2.4, height: 0.6 }, scene);
  plane.position = new Vector3(entity.position[0], y, entity.position[1]);
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
  plane.material = material;
  plane.isPickable = false;
}

export function createScene(engine: Engine, canvas: HTMLCanvasElement): SceneApi {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.96, 0.94, 0.89, 1);

  const light = new HemisphericLight('daylight', new Vector3(-0.3, 1, 0.4), scene);
  light.intensity = 1.1;
  light.groundColor = new Color3(0.55, 0.5, 0.42);

  const solid = (name: string, color: Color3): StandardMaterial => {
    const material = new StandardMaterial(name, scene);
    material.diffuseColor = color;
    material.specularColor = Color3.Black();
    return material;
  };

  // Floor + a hint of walls.
  const ground = MeshBuilder.CreateGround('ground', { width: 18, height: 12 }, scene);
  ground.material = solid('ground-mat', WORLD.ground);
  ground.isPickable = false;

  // Shelf rows (aisle) and the backroom desk — greybox stand-ins for the kit.
  const fixtures: [string, Vector3, Vector3, Color3][] = [
    ['shelf-a', new Vector3(4, 0.5, -3.4), new Vector3(6.4, 1, 0.9), WORLD.shelf],
    ['shelf-b', new Vector3(4, 0.5, 1.6), new Vector3(6.4, 1, 0.9), WORLD.shelf],
    ['desk', new Vector3(-7.4, 0.45, -2.2), new Vector3(1.2, 0.9, 5), WORLD.desk],
  ];
  for (const [name, position, size, color] of fixtures) {
    const box = MeshBuilder.CreateBox(
      name,
      { width: size.x, height: size.y, depth: size.z },
      scene,
    );
    box.position = position;
    box.material = solid(`${name}-mat`, color);
    box.isPickable = false;
  }

  // Scannables placed from case data (#41: placement is data-driven).
  const productMaterials = new Map<string, StandardMaterial>();
  for (const entity of ENTITIES) {
    const isProduct = entity.kind === 'product';
    const mesh = isProduct
      ? MeshBuilder.CreateBox(entity.id, { width: 0.7, height: 0.9, depth: 0.5 }, scene)
      : MeshBuilder.CreateBox(entity.id, { width: 0.8, height: 0.08, depth: 0.6 }, scene);
    mesh.position = new Vector3(entity.position[0], isProduct ? 1.45 : 0.95, entity.position[1]);
    const material = solid(`mat:${entity.id}`, isProduct ? WORLD.product : WORLD.document);
    mesh.material = material;
    if (isProduct) productMaterials.set(entity.id, material);
    makeLabel(scene, entity, isProduct ? 2.35 : 1.7);
  }

  // Player.
  const player = MeshBuilder.CreateCapsule('player', { height: 1.6, radius: 0.35 }, scene);
  player.position = new Vector3(0, 0.8, 4.2);
  player.material = solid('player-mat', WORLD.player);
  player.isPickable = false;

  // Nearest-scannable marker ring.
  const ring = MeshBuilder.CreateTorus('nearby-ring', { diameter: 1.6, thickness: 0.06 }, scene);
  const ringMat = solid('ring-mat', new Color3(0.15, 0.35, 0.5));
  ringMat.emissiveColor = new Color3(0.15, 0.35, 0.5);
  ring.material = ringMat;
  ring.isVisible = false;
  ring.isPickable = false;

  // Fixed 3/4 isometric rig that tracks the player (§11).
  const camera = new ArcRotateCamera(
    'iso-camera',
    -Math.PI / 4,
    Math.PI / 3.2,
    16,
    player.position.clone(),
    scene,
  );
  camera.lowerRadiusLimit = 12;
  camera.upperRadiusLimit = 20;
  camera.lowerAlphaLimit = camera.upperAlphaLimit = camera.alpha;
  camera.lowerBetaLimit = camera.upperBetaLimit = camera.beta;
  camera.attachControl(canvas, true);
  camera.wheelPrecision = 40;
  camera.panningSensibility = 0; // no panning — the rig follows the player

  // Movement: WASD / arrows, pointer-first policy keeps click-to-scan too.
  const keys = new Set<string>();
  window.addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

  const entityById = new Map(ENTITIES.map((e) => [e.id, e]));

  scene.onPointerDown = () => {
    const pick = scene.pick(scene.pointerX, scene.pointerY);
    const name = pick?.pickedMesh?.name;
    if (!name || !entityById.has(name)) return;
    const entity = entityById.get(name)!;
    const dx = entity.position[0] - player.position.x;
    const dz = entity.position[1] - player.position.z;
    if (Math.hypot(dx, dz) <= SCAN_RANGE) useGameStore.getState().scan(name);
  };

  // Camera-relative axes for our fixed alpha: forward is toward -x/-z diagonal.
  const SPEED = 5;
  scene.onBeforeRenderObservable.add(() => {
    const dt = engine.getDeltaTime() / 1000;

    let dx = 0;
    let dz = 0;
    if (keys.has('w') || keys.has('arrowup')) dz -= 1;
    if (keys.has('s') || keys.has('arrowdown')) dz += 1;
    if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
    if (keys.has('d') || keys.has('arrowright')) dx += 1;
    if (dx !== 0 || dz !== 0) {
      const len = Math.hypot(dx, dz);
      player.position.x = Math.min(
        BOUNDS.x,
        Math.max(-BOUNDS.x, player.position.x + (dx / len) * SPEED * dt),
      );
      player.position.z = Math.min(
        BOUNDS.z,
        Math.max(-BOUNDS.z, player.position.z + (dz / len) * SPEED * dt),
      );
    }

    // Camera follows with a soft lerp.
    camera.target = Vector3.Lerp(camera.target, player.position, 0.12);

    // Nearest scannable in reach → store (drives the HUD prompt + ring).
    let nearest: ProtoEntity | null = null;
    let nearestDist = SCAN_RANGE;
    for (const entity of ENTITIES) {
      const d = Math.hypot(
        entity.position[0] - player.position.x,
        entity.position[1] - player.position.z,
      );
      if (d <= nearestDist) {
        nearest = entity;
        nearestDist = d;
      }
    }
    useGameStore.getState().setNearby(nearest?.id ?? null, nearest?.label ?? null);
    if (nearest) {
      ring.isVisible = true;
      ring.position = new Vector3(nearest.position[0], 0.06, nearest.position[1]);
    } else {
      ring.isVisible = false;
    }
  });

  // Engine verdict → world reaction (#43 embryo): product materials shift
  // as the model learns what's affected, uncertain, or safe.
  useGameStore.subscribe((state, prev) => {
    if (state.productStatus === prev.productStatus) return;
    for (const [productId, status] of Object.entries(state.productStatus)) {
      const material = productMaterials.get(productId);
      if (!material) continue;
      material.emissiveColor = STATUS_EMISSIVE[status];
      material.alpha = status === 'uncertain' ? 0.65 : 1; // textured fog stand-in
    }
  });

  engine.runRenderLoop(() => scene.render());

  return {
    teleportTo: (entityId) => {
      const entity = entityById.get(entityId);
      if (!entity) return false;
      player.position.x = entity.position[0];
      player.position.z = Math.min(BOUNDS.z, entity.position[1] + 1.2);
      return true;
    },
  };
}
