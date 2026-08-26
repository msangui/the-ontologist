import { create } from 'zustand';

/**
 * The one bridge between Babylon and React (backlog #16).
 *
 * Babylon code uses `useGameStore.getState()` / `.subscribe()` imperatively;
 * React components use the hook. Nothing else may cross the boundary.
 */
export interface GameState {
  /** Entity selected by clicking a scannable object in the 3D scene. */
  selectedEntityId: string | null;
  /** Incremented by the React overlay; the scene reacts (round-trip demo). */
  pulseCount: number;
  selectEntity: (entityId: string | null) => void;
  pulse: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  selectedEntityId: null,
  pulseCount: 0,
  selectEntity: (entityId) => set({ selectedEntityId: entityId }),
  pulse: () => set((state) => ({ pulseCount: state.pulseCount + 1 })),
}));
