import { create } from 'zustand';
import { CaseSession, type FactView, type ProductStatus, type ScanOutcome } from '../case/session';

/**
 * The one bridge between Babylon and React. Babylon uses getState()/subscribe()
 * imperatively; React uses the hook. All case logic lives in CaseSession —
 * this store only mirrors it for the two presentation layers.
 */

export interface LensCardView {
  readonly entityId: string;
  readonly label: string;
  readonly blurb: string;
  readonly learned: readonly FactView[];
  readonly inferred: readonly FactView[];
  readonly alreadyScanned: boolean;
}

export interface GameState {
  scannedIds: readonly string[];
  scannedCount: number;
  scannableCount: number;
  journal: readonly FactView[];
  contradictionCount: number;
  productStatus: Readonly<Record<string, ProductStatus>>;
  caseComplete: boolean;
  lensCard: LensCardView | null;
  journalOpen: boolean;
  /** Scannable currently in reach (set by the scene each frame). */
  nearbyId: string | null;
  nearbyLabel: string | null;

  scan: (entityId: string) => void;
  setNearby: (id: string | null, label: string | null) => void;
  toggleJournal: () => void;
  closeLens: () => void;
}

const session = new CaseSession();

const mirror = (outcome: ScanOutcome | null, prev: GameState): Partial<GameState> => ({
  scannedIds: prev.scannedIds.includes(outcome?.entity.id ?? '')
    ? prev.scannedIds
    : [...prev.scannedIds, ...(outcome ? [outcome.entity.id] : [])],
  scannedCount: session.scannedCount,
  scannableCount: session.scannableCount,
  journal: session.journal(),
  contradictionCount: session.contradictionCount(),
  productStatus: session.productStatuses(),
  caseComplete: session.caseComplete(),
  lensCard: outcome
    ? {
        entityId: outcome.entity.id,
        label: outcome.entity.label,
        blurb: outcome.entity.blurb,
        learned: outcome.learned,
        inferred: outcome.inferred,
        alreadyScanned: outcome.learned.length === 0 && outcome.inferred.length === 0,
      }
    : prev.lensCard,
});

export const useGameStore = create<GameState>((set) => ({
  scannedIds: [],
  scannedCount: 0,
  scannableCount: session.scannableCount,
  journal: [],
  contradictionCount: 0,
  productStatus: session.productStatuses(),
  caseComplete: false,
  lensCard: null,
  journalOpen: false,
  nearbyId: null,
  nearbyLabel: null,

  scan: (entityId) =>
    set((prev) => {
      const outcome = session.scan(entityId);
      return mirror(outcome, prev);
    }),
  setNearby: (id, nearbyLabel) =>
    set((prev) => (prev.nearbyId === id ? prev : { nearbyId: id, nearbyLabel })),
  toggleJournal: () => set((prev) => ({ journalOpen: !prev.journalOpen })),
  closeLens: () => set({ lensCard: null }),
}));
