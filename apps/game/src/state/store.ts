import { create } from 'zustand';
import { clearAutosave, saveAutosave } from '../case/persistence';
import {
  CaseSession,
  type CasePhase,
  type DebriefView,
  type FactView,
  type ProductStatus,
  type QueryResultView,
  type RecallDecision,
  type ScanOutcome,
} from '../case/session';

/**
 * The one bridge between Babylon and React. Babylon uses getState()/subscribe()
 * imperatively; React uses the hook. All case logic lives in CaseSession —
 * this store only mirrors it for the two presentation layers, and persists it
 * (#62/#63: autosave at beats + user-facing export/import).
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
  phase: CasePhase;
  readyToCommit: boolean;
  commitOpen: boolean;
  debrief: DebriefView | null;
  lensCard: LensCardView | null;
  journalOpen: boolean;
  /** Scannable currently in reach (set by the scene each frame). */
  nearbyId: string | null;
  nearbyLabel: string | null;

  /** The Test verb: sentence-based query builder state (#51). */
  queryOpen: boolean;
  containsSlotOptions: readonly { id: string; label: string }[];
  queryResults: readonly QueryResultView[] | null;
  querySentence: string | null;

  /** Completed autosave writes this session (e2e waits on this). */
  savesWritten: number;
  importError: string | null;

  scan: (entityId: string) => void;
  setNearby: (id: string | null, label: string | null) => void;
  toggleJournal: () => void;
  toggleQuery: () => void;
  runContainsQuery: (objectId: string) => void;
  runSoldHereQuery: () => void;
  closeLens: () => void;
  openCommit: () => void;
  closeCommit: () => void;
  fileReport: (decisions: Record<string, RecallDecision>) => void;
  resetCase: () => void;
  exportSave: () => string;
  importSave: (raw: string) => boolean;
}

let session = new CaseSession();

/** Try to resume from the persisted autosave. Called once at bootstrap. */
export function hydrateFromSnapshot(snapshot: unknown): boolean {
  const restored = CaseSession.restore(snapshot);
  if (!restored) return false;
  session = restored;
  useGameStore.setState((prev) => ({
    ...mirror(null, prev),
    scannedIds: session.snapshot().scannedIds,
  }));
  return true;
}

const persist = (): void => {
  void saveAutosave(session.snapshot()).then((ok) => {
    if (ok) useGameStore.setState((prev) => ({ savesWritten: prev.savesWritten + 1 }));
  });
};

const mirror = (outcome: ScanOutcome | null, prev: GameState): Partial<GameState> => ({
  scannedIds: prev.scannedIds.includes(outcome?.entity.id ?? '')
    ? prev.scannedIds
    : [...prev.scannedIds, ...(outcome ? [outcome.entity.id] : [])],
  scannedCount: session.scannedCount,
  scannableCount: session.scannableCount,
  journal: session.journal(),
  contradictionCount: session.contradictionCount(),
  productStatus: session.productStatuses(),
  phase: session.phase,
  readyToCommit: session.readyToCommit(),
  debrief: session.debrief(),
  containsSlotOptions: session.containsSlotOptions(),
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

const freshUiState = {
  scannedIds: [] as readonly string[],
  scannedCount: 0,
  journal: [] as readonly FactView[],
  contradictionCount: 0,
  readyToCommit: false,
  commitOpen: false,
  debrief: null,
  lensCard: null,
  journalOpen: false,
  queryOpen: false,
  queryResults: null,
  querySentence: null,
  importError: null,
};

export const useGameStore = create<GameState>((set) => ({
  ...freshUiState,
  scannableCount: session.scannableCount,
  productStatus: session.productStatuses(),
  phase: session.phase,
  containsSlotOptions: session.containsSlotOptions(),
  nearbyId: null,
  nearbyLabel: null,
  savesWritten: 0,

  scan: (entityId) => {
    set((prev) => {
      const outcome = session.scan(entityId);
      return mirror(outcome, prev);
    });
    persist();
  },
  setNearby: (id, nearbyLabel) =>
    set((prev) => (prev.nearbyId === id ? prev : { nearbyId: id, nearbyLabel })),
  toggleJournal: () => set((prev) => ({ journalOpen: !prev.journalOpen })),
  toggleQuery: () =>
    set((prev) => ({ queryOpen: !prev.queryOpen, ...(prev.queryOpen ? {} : { lensCard: null }) })),
  runContainsQuery: (objectId) =>
    set((prev) => ({
      queryResults: session.queryProductsContaining(objectId),
      querySentence: `Which products contain ${
        prev.containsSlotOptions.find((o) => o.id === objectId)?.label ?? objectId
      }?`,
    })),
  runSoldHereQuery: () =>
    set({
      queryResults: session.queryProductsSoldHere(),
      querySentence: 'Which products are sold at FreshMart #12?',
    }),
  closeLens: () => set({ lensCard: null }),
  openCommit: () => set({ commitOpen: true, lensCard: null, queryOpen: false }),
  closeCommit: () => set({ commitOpen: false }),
  fileReport: (decisions) => {
    let committed = false;
    set((prev) => {
      if (!session.commit(decisions)) return prev;
      committed = true;
      return { ...mirror(null, prev), commitOpen: false };
    });
    if (committed) persist();
  },

  resetCase: () => {
    session = new CaseSession();
    void clearAutosave();
    set((prev) => ({
      ...freshUiState,
      scannableCount: session.scannableCount,
      productStatus: session.productStatuses(),
      phase: session.phase,
      containsSlotOptions: session.containsSlotOptions(),
      savesWritten: prev.savesWritten,
    }));
  },

  /** User-facing save file (#63): the snapshot as pretty JSON. */
  exportSave: () => JSON.stringify(session.snapshot(), null, 2),

  importSave: (raw) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      set({ importError: 'That file is not a valid save (not JSON).' });
      return false;
    }
    const restored = CaseSession.restore(parsed);
    if (!restored) {
      set({ importError: 'That file is not a valid save (wrong version or corrupt).' });
      return false;
    }
    session = restored;
    set((prev) => ({
      ...mirror(null, prev),
      ...{ lensCard: null, commitOpen: false, queryResults: null, querySentence: null },
      scannedIds: session.snapshot().scannedIds,
      importError: null,
    }));
    persist();
    return true;
  },
}));
