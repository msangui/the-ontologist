import {
  AssertionLog,
  VOCAB,
  c,
  explain,
  infer,
  select,
  v,
  type Assertion,
  type ExplanationNode,
  type Fact,
  type InferenceResult,
  type TruthValue,
} from '@ontologist/semantic-engine';
import { gradeQuestion } from '@ontologist/scenario-schema';
import {
  COMPETENCY_QUESTIONS,
  DEBRIEF_TEXTS,
  ENTITIES,
  LABELS,
  MODEL_CANDIDATES,
  MODEL_CLASSES,
  ONTOLOGY_FACTS,
  PRODUCT_IDS,
  RECALLED_CLASS,
  STORE_ID,
  questionPrompt,
  type ProtoEntity,
} from './protoCase';

/**
 * The proto-case play session — now with the Model verb (backlog #49 embryo):
 * scanning captures CLUES (leads); the player RECORDS them into the model,
 * choosing the truth value for ambiguous evidence. Inference, statuses,
 * queries, and competency grading all run against the model the player
 * actually built — a wrong recording produces wrong verdicts, self-made
 * contradictions, and a worse Debrief. Unlimited undo (#61) rides the
 * event-sourced log for free. No Babylon, no React — text-harness ready.
 */

export interface FactView {
  readonly id: string;
  readonly text: string;
  readonly truth: TruthValue;
  readonly inferred: boolean;
  /** Label of the evidence that produced it (base facts only). */
  readonly source?: string;
  /** Ground-evidence texts supporting an inferred fact ("why?"). */
  readonly explanation?: readonly string[];
}

/** One piece of evidence the player may record into the model. */
export interface ClueView {
  readonly id: string;
  readonly sourceId: string;
  readonly sourceLabel: string;
  readonly text: string;
  /** The player must choose the truth when recording an ambiguous clue. */
  readonly ambiguous: boolean;
  /** Set once recorded (the truth the player committed to). */
  readonly recordedTruth?: TruthValue;
}

export type ProductStatus = 'pending' | 'affected' | 'uncertain' | 'safe';

/**
 * Case Arc (#56 embryo): Brief → Wave 1 (investigate) → Commit →
 * Field Verification (wave-2 evidence) → Resolve → Debrief.
 */
export type CasePhase = 'investigate' | 'verification' | 'debrief';

/** The Act (#53 embryo): what to do with each product when filing the report. */
export type RecallDecision = 'pull' | 'hold' | 'clear' | 'leave';

export interface DebriefRow {
  readonly entityId: string;
  readonly label: string;
  readonly decision: RecallDecision;
  readonly fieldResult: string;
  readonly verdict: 'right' | 'harm';
  readonly note: string;
}

export interface CompetencyResult {
  readonly id: string;
  readonly prompt: string;
  readonly passed: boolean;
}

export interface DebriefView {
  readonly rows: readonly DebriefRow[];
  readonly anchorOutcome: string;
  readonly harm: boolean;
  readonly reworkNote: string;
  /** #57 embryo: the hidden battery, graded structure-agnostically. */
  readonly competency: {
    readonly passed: number;
    readonly total: number;
    readonly results: readonly CompetencyResult[];
  };
}

export interface ScanOutcome {
  readonly entity: ProtoEntity;
  /** The leads this evidence offers (record them to build the model). */
  readonly clues: readonly ClueView[];
}

const label = (value: string | number | boolean): string =>
  typeof value === 'string' ? (LABELS[value] ?? value) : String(value);

const PREDICATE_TEXT: Record<string, string> = {
  contains: 'contains',
  soldAt: 'is sold at',
  sells: 'sells',
  [VOCAB.instanceOf]: 'is a',
  [VOCAB.subclassOf]: 'is a kind of',
  [VOCAB.inverseOf]: 'mirrors',
  [VOCAB.transitiveProperty]: 'chains through parts',
  [VOCAB.sameAs]: 'is the same as',
};

const factText = (f: {
  subject: string;
  predicate: string;
  object: string | number | boolean;
}): string => {
  if (f.predicate === VOCAB.transitiveProperty)
    return `“${label(f.subject)}” carries through parts`;
  const verb = PREDICATE_TEXT[f.predicate] ?? f.predicate;
  return `${label(f.subject)} ${verb} ${label(f.object)}`;
};

interface ClueState {
  readonly id: string;
  readonly sourceId: string;
  readonly factIndex: number;
  recordedTruth?: TruthValue;
  assertionId?: string;
}

/** One player classification: entity → class, true or explicitly false. */
interface ClassificationState {
  readonly entityId: string;
  readonly classId: string;
  readonly truth: 'true' | 'false';
  readonly assertionId: string;
}

/** One player merge: two entity ids asserted to be the same thing. */
interface MergeState {
  readonly a: string;
  readonly b: string;
  readonly assertionId: string;
}

type UndoEntry =
  | { readonly kind: 'clue'; readonly clueId: string }
  | { readonly kind: 'classify'; readonly key: string }
  | { readonly kind: 'merge'; readonly key: string };

/** Model View data (#49 embryo): classes as regions, candidates as cards. */
export interface ModelClassView {
  readonly id: string;
  readonly label: string;
  readonly playerEditable: boolean;
  readonly members: readonly {
    readonly id: string;
    readonly label: string;
    readonly inferred: boolean;
    readonly explanation?: readonly string[];
  }[];
}

export interface ModelCandidateView {
  readonly id: string;
  readonly label: string;
  readonly note?: string;
  /** Player classification per editable class id, when made. */
  readonly classification?: { readonly classId: string; readonly truth: 'true' | 'false' };
  /** Labels of candidates this one has been merged with (sameAs). */
  readonly mergedWith: readonly string[];
}

export interface ModelViewData {
  readonly classes: readonly ModelClassView[];
  readonly candidates: readonly ModelCandidateView[];
}

/** Versioned save shape (#62): the assertion log IS the model save (§18.7). */
export interface CaseSnapshot {
  readonly saveVersion: 4;
  readonly log: string;
  readonly scannedIds: readonly string[];
  readonly phase: CasePhase;
  readonly decisions: Readonly<Record<string, RecallDecision>>;
  readonly seq: number;
  /** [clueId, recordedTruth, assertionId] for every recorded clue. */
  readonly recorded: readonly [string, TruthValue, string][];
  /** [entityId, classId, truth, assertionId] for every player classification. */
  readonly classifications: readonly [string, string, 'true' | 'false', string][];
  /** [entityIdA, entityIdB, assertionId] for every player merge. */
  readonly merges: readonly [string, string, string][];
  /** Modeling-action order — the undo stack. */
  readonly undoStack: readonly UndoEntry[];
}

export class CaseSession {
  private readonly log: AssertionLog;
  private readonly entities = new Map(ENTITIES.map((e) => [e.id, e]));
  private readonly scanned = new Set<string>();
  private readonly clues = new Map<string, ClueState>();
  private readonly classifications = new Map<string, ClassificationState>();
  private readonly merges = new Map<string, MergeState>();
  private undoStack: UndoEntry[] = [];
  private result: InferenceResult;
  private seq = 0;

  private currentPhase: CasePhase = 'investigate';
  private decisions: Record<string, RecallDecision> = {};

  constructor(snapshot?: CaseSnapshot) {
    if (snapshot) {
      this.log = AssertionLog.deserialize(snapshot.log);
      this.scanned = new Set(snapshot.scannedIds);
      this.currentPhase = snapshot.phase;
      this.decisions = { ...snapshot.decisions };
      this.seq = snapshot.seq;
      for (const entityId of this.scanned) this.registerClues(entityId);
      for (const [clueId, truth, assertionId] of snapshot.recorded) {
        const clue = this.clues.get(clueId);
        if (clue) {
          clue.recordedTruth = truth;
          clue.assertionId = assertionId;
        }
      }
      for (const [entityId, classId, truth, assertionId] of snapshot.classifications) {
        this.classifications.set(`${entityId}|${classId}`, {
          entityId,
          classId,
          truth,
          assertionId,
        });
      }
      for (const [a, b, assertionId] of snapshot.merges) {
        this.merges.set(CaseSession.mergeKey(a, b), { a, b, assertionId });
      }
      this.undoStack = [...snapshot.undoStack];
    } else {
      this.log = new AssertionLog();
      for (const fact of ONTOLOGY_FACTS) {
        this.log.assert({
          id: `f:${(this.seq += 1)}`,
          subject: fact.subject,
          predicate: fact.predicate,
          object: fact.object,
          truth: fact.truth ?? 'true',
          provenance: { kind: 'scenario' },
        });
      }
    }
    this.result = infer(this.log);
  }

  snapshot(): CaseSnapshot {
    return {
      saveVersion: 4,
      log: this.log.serialize(),
      scannedIds: [...this.scanned],
      phase: this.currentPhase,
      decisions: { ...this.decisions },
      seq: this.seq,
      recorded: [...this.clues.values()]
        .filter((clue) => clue.recordedTruth && clue.assertionId)
        .map((clue) => [clue.id, clue.recordedTruth!, clue.assertionId!]),
      classifications: [...this.classifications.values()].map((entry) => [
        entry.entityId,
        entry.classId,
        entry.truth,
        entry.assertionId,
      ]),
      merges: [...this.merges.values()].map((entry) => [entry.a, entry.b, entry.assertionId]),
      undoStack: [...this.undoStack],
    };
  }

  /** Restore from a snapshot; null on anything corrupt (never a crash). */
  static restore(snapshot: unknown): CaseSession | null {
    try {
      const snap = snapshot as CaseSnapshot;
      if (
        !snap ||
        snap.saveVersion !== 4 ||
        typeof snap.log !== 'string' ||
        !Array.isArray(snap.scannedIds) ||
        !Array.isArray(snap.recorded) ||
        !Array.isArray(snap.classifications) ||
        !Array.isArray(snap.merges) ||
        !Array.isArray(snap.undoStack) ||
        typeof snap.seq !== 'number'
      ) {
        return null;
      }
      return new CaseSession(snap);
    } catch {
      return null;
    }
  }

  get phase(): CasePhase {
    return this.currentPhase;
  }

  /** An entity exists in the world only once its wave has arrived. */
  isAvailable(entityId: string): boolean {
    const entity = this.entities.get(entityId);
    if (!entity) return false;
    return (entity.wave ?? 1) === 1 || this.currentPhase !== 'investigate';
  }

  isScanned(entityId: string): boolean {
    return this.scanned.has(entityId);
  }

  get scannedCount(): number {
    return this.scanned.size;
  }

  get scannableCount(): number {
    return [...this.entities.keys()].filter((id) => this.isAvailable(id)).length;
  }

  // --- Investigate: scanning captures leads -------------------------------

  private registerClues(entityId: string): void {
    const entity = this.entities.get(entityId);
    if (!entity) return;
    entity.scanFacts.forEach((_, index) => {
      const id = `${entityId}#${index}`;
      if (!this.clues.has(id)) {
        this.clues.set(id, { id, sourceId: entityId, factIndex: index });
      }
    });
  }

  scan(entityId: string): ScanOutcome | null {
    const entity = this.entities.get(entityId);
    if (!entity || !this.isAvailable(entityId)) return null;
    this.scanned.add(entityId);
    this.registerClues(entityId);
    return { entity, clues: this.cluesOf(entityId) };
  }

  private clueView(state: ClueState): ClueView {
    const entity = this.entities.get(state.sourceId)!;
    const fact = entity.scanFacts[state.factIndex]!;
    return {
      id: state.id,
      sourceId: state.sourceId,
      sourceLabel: entity.label,
      text: factText(fact),
      ambiguous: fact.ambiguous ?? false,
      ...(state.recordedTruth ? { recordedTruth: state.recordedTruth } : {}),
    };
  }

  cluesOf(entityId: string): ClueView[] {
    return [...this.clues.values()]
      .filter((clue) => clue.sourceId === entityId)
      .map((clue) => this.clueView(clue));
  }

  /** Every unrecorded clue from scanned evidence — the player's to-model list. */
  leads(): ClueView[] {
    return [...this.clues.values()]
      .filter((clue) => !clue.recordedTruth)
      .map((clue) => this.clueView(clue));
  }

  // --- Model: the player records clues into the model ---------------------

  /**
   * Record a clue as a model fact. Ambiguous clues REQUIRE the player's
   * truth choice — recording "false" where the evidence says "can't tell"
   * is exactly the unknown-vs-false mistake [I5-D3], and the model will
   * faithfully carry it.
   */
  recordClue(clueId: string, chosenTruth?: TruthValue): boolean {
    if (this.currentPhase === 'debrief') return false;
    const clue = this.clues.get(clueId);
    if (!clue || clue.recordedTruth) return false;
    const entity = this.entities.get(clue.sourceId)!;
    const fact = entity.scanFacts[clue.factIndex]!;
    if (fact.ambiguous && !chosenTruth) return false;

    const truth = fact.ambiguous ? chosenTruth! : (fact.truth ?? 'true');
    const assertionId = `f:${(this.seq += 1)}`;
    this.log.assert({
      id: assertionId,
      subject: fact.subject,
      predicate: fact.predicate,
      object: fact.object,
      truth,
      provenance: { kind: 'evidence', evidenceId: clue.sourceId },
    });
    clue.recordedTruth = truth;
    clue.assertionId = assertionId;
    this.undoStack.push({ kind: 'clue', clueId });
    this.result = infer(this.log);
    return true;
  }

  // --- Classify: the player builds the ontology (#49) ---------------------

  /**
   * Classify a candidate into a player-editable class — instanceOf true, or
   * an explicit false ("this is NOT a tree nut"). The engine's subclass rule
   * does the rest: classifying into a recalled subclass derives recall status.
   * A wrong classification produces wrong verdicts, exactly as recorded.
   */
  classify(entityId: string, classId: string, truth: 'true' | 'false'): boolean {
    if (this.currentPhase === 'debrief') return false;
    if (!MODEL_CLASSES.some((cls) => cls.id === classId)) return false;
    if (!MODEL_CANDIDATES.some((candidate) => candidate.id === entityId)) return false;
    const key = `${entityId}|${classId}`;
    if (this.classifications.has(key)) return false; // undo first, then reclassify

    const assertionId = `f:${(this.seq += 1)}`;
    this.log.assert({
      id: assertionId,
      subject: entityId,
      predicate: VOCAB.instanceOf,
      object: classId,
      truth,
      provenance: { kind: 'player' },
    });
    this.classifications.set(key, { entityId, classId, truth, assertionId });
    this.undoStack.push({ kind: 'classify', key });
    this.result = infer(this.log);
    return true;
  }

  static mergeKey(a: string, b: string): string {
    return [a, b].sort().join('~');
  }

  /**
   * Merge two candidates: assert sameAs [I4-D5]. Facts transfer across the
   * identity WITHOUT moving the originals; undo retracts the link and every
   * transferred fact un-derives — split with evidence retention, for free.
   */
  merge(entityIdA: string, entityIdB: string): boolean {
    if (this.currentPhase === 'debrief') return false;
    if (entityIdA === entityIdB) return false;
    const candidates = new Set(MODEL_CANDIDATES.map((candidate) => candidate.id));
    if (!candidates.has(entityIdA) || !candidates.has(entityIdB)) return false;
    const key = CaseSession.mergeKey(entityIdA, entityIdB);
    if (this.merges.has(key)) return false;

    const assertionId = `f:${(this.seq += 1)}`;
    this.log.assert({
      id: assertionId,
      subject: entityIdA,
      predicate: VOCAB.sameAs,
      object: entityIdB,
      truth: 'true',
      provenance: { kind: 'player' },
    });
    this.merges.set(key, { a: entityIdA, b: entityIdB, assertionId });
    this.undoStack.push({ kind: 'merge', key });
    this.result = infer(this.log);
    return true;
  }

  modelView(): ModelViewData {
    const memberOf = (classId: string) =>
      [...this.result.base, ...this.result.derived]
        .filter(
          (f) =>
            f.predicate === VOCAB.instanceOf &&
            f.object === classId &&
            f.truth === 'true' &&
            typeof f.subject === 'string',
        )
        .map((f) => {
          const inferred = this.result.derived.some((d) => d.id === f.id);
          return {
            id: f.subject,
            label: LABELS[f.subject] ?? f.subject,
            inferred,
            ...(inferred ? { explanation: this.groundTexts(f.id) } : {}),
          };
        });

    const classes: ModelClassView[] = [
      {
        id: RECALLED_CLASS,
        label: LABELS[RECALLED_CLASS] ?? RECALLED_CLASS,
        playerEditable: false,
        members: memberOf(RECALLED_CLASS),
      },
      ...MODEL_CLASSES.map((cls) => ({
        id: cls.id,
        label: cls.label,
        playerEditable: true,
        members: memberOf(cls.id),
      })),
    ];

    const candidates: ModelCandidateView[] = MODEL_CANDIDATES.map((candidate) => {
      const classification = [...this.classifications.values()].find(
        (entry) => entry.entityId === candidate.id,
      );
      const mergedWith = [...this.merges.values()]
        .filter((entry) => entry.a === candidate.id || entry.b === candidate.id)
        .map((entry) => {
          const other = entry.a === candidate.id ? entry.b : entry.a;
          return LABELS[other] ?? other;
        });
      return {
        id: candidate.id,
        label: candidate.label,
        ...(candidate.note ? { note: candidate.note } : {}),
        ...(classification
          ? { classification: { classId: classification.classId, truth: classification.truth } }
          : {}),
        mergedWith,
      };
    });

    return { classes, candidates };
  }

  /** Record every unambiguous clue from one evidence source. */
  recordAllFrom(entityId: string): number {
    let recorded = 0;
    for (const clue of this.clues.values()) {
      if (clue.sourceId !== entityId || clue.recordedTruth) continue;
      const fact = this.entities.get(entityId)!.scanFacts[clue.factIndex]!;
      if (fact.ambiguous) continue; // ambiguity is always the player's call
      if (this.recordClue(clue.id)) recorded += 1;
    }
    return recorded;
  }

  get canUndo(): boolean {
    return this.currentPhase !== 'debrief' && this.undoStack.length > 0;
  }

  /** Unlimited undo (#61): retract the last modeling action of either kind. */
  undo(): boolean {
    if (!this.canUndo) return false;
    const entry = this.undoStack.pop()!;
    if (entry.kind === 'clue') {
      const clue = this.clues.get(entry.clueId);
      if (!clue?.assertionId) return false;
      this.log.retract(clue.assertionId);
      delete clue.recordedTruth;
      delete clue.assertionId;
    } else if (entry.kind === 'classify') {
      const classification = this.classifications.get(entry.key);
      if (!classification) return false;
      this.log.retract(classification.assertionId);
      this.classifications.delete(entry.key);
    } else {
      // Split: retract the sameAs — every transferred fact un-derives,
      // and the original evidence never moved [I4-D5].
      const merge = this.merges.get(entry.key);
      if (!merge) return false;
      this.log.retract(merge.assertionId);
      this.merges.delete(entry.key);
    }
    this.result = infer(this.log);
    return true;
  }

  private viewOfBase(assertion: Assertion): FactView {
    const source =
      assertion.provenance.kind === 'evidence'
        ? (LABELS[assertion.provenance.evidenceId] ?? assertion.provenance.evidenceId)
        : undefined;
    return {
      id: assertion.id,
      text: factText(assertion),
      truth: assertion.truth,
      inferred: false,
      ...(source ? { source } : {}),
    };
  }

  private viewOfDerived(id: string, fact: Fact): FactView {
    return {
      id,
      text: factText(fact),
      truth: fact.truth,
      inferred: true,
      explanation: this.groundTexts(id),
    };
  }

  /** Flatten an explanation tree to the ground evidence lines (pillar 3). */
  private groundTexts(factId: string): string[] {
    const baseById = new Map(this.result.base.map((a) => [a.id, a]));
    const lines: string[] = [];
    const walk = (node: ExplanationNode): void => {
      if (node.premises.length === 0) {
        const ground = baseById.get(node.factId);
        if (ground && ground.provenance.kind !== 'scenario') {
          const source =
            ground.provenance.kind === 'evidence'
              ? (LABELS[ground.provenance.evidenceId] ?? ground.provenance.evidenceId)
              : 'you';
          lines.push(`${factText(ground)} — ${source}`);
        }
        return;
      }
      node.premises.forEach(walk);
    };
    walk(explain(this.result, factId));
    return [...new Set(lines)];
  }

  /** The model the player built: recorded facts, then inferences. */
  journal(): FactView[] {
    const base = this.result.base
      .filter((a) => a.provenance.kind === 'evidence')
      .map((a) => this.viewOfBase(a));
    const derived = this.result.derived
      // The player-facing feed: skip pure bookkeeping (inverse mirrors,
      // sameAs symmetry/transitivity) but keep identity fact-transfers.
      .filter((f) => !['R-inverse', 'R-sameAs-sym', 'R-sameAs-trans'].includes(f.derivation.ruleId))
      .map((f) => this.viewOfDerived(f.id, f));
    return [...base, ...derived];
  }

  contradictionCount(): number {
    // Mirrored inverse conflicts collapse into one player-facing red thread
    // (see #23/#58): group each conflict by the *evidence* assertions at its
    // root, ignoring scenario bookkeeping like the inverseOf declaration.
    const baseById = new Map(this.result.base.map((a) => [a.id, a]));
    const derivedById = new Map(this.result.derived.map((f) => [f.id, f]));

    const collectEvidence = (factId: string, into: Set<string>): void => {
      const derived = derivedById.get(factId);
      if (derived) {
        for (const premise of derived.derivation.premises) collectEvidence(premise, into);
        return;
      }
      const ground = baseById.get(factId);
      if (ground && ground.provenance.kind !== 'scenario') into.add(factId);
    };

    const keys = new Set(
      this.result.contradictions.map((contradiction) => {
        const evidence = new Set<string>();
        for (const id of contradiction.factIds) collectEvidence(id, evidence);
        return [...evidence].sort().join('~');
      }),
    );
    return keys.size;
  }

  /**
   * The case question, answered by the PLAYER'S model: a product can only be
   * called safe once the recall is in the model, the wave-1 documents are
   * scanned, and the product's own clues are all recorded.
   */
  productStatuses(): Record<string, ProductStatus> {
    const recalled = new Set<string>();
    const all = [...this.result.base, ...this.result.derived];
    for (const f of all) {
      if (f.predicate === VOCAB.instanceOf && f.object === RECALLED_CLASS && f.truth === 'true') {
        recalled.add(f.subject);
      }
    }

    const allDocsScanned = ENTITIES.filter(
      (e) => e.kind === 'document' && (e.wave ?? 1) === 1,
    ).every((e) => this.scanned.has(e.id));

    const cluesRecorded = (entityId: string): boolean =>
      [...this.clues.values()]
        .filter((clue) => clue.sourceId === entityId)
        .every((clue) => clue.recordedTruth);

    const statuses: Record<string, ProductStatus> = {};
    for (const productId of PRODUCT_IDS) {
      const containsFacts = all.filter(
        (f) => f.subject === productId && f.predicate === 'contains',
      );
      const hasRecalledTrue = containsFacts.some(
        (f) => typeof f.object === 'string' && recalled.has(f.object) && f.truth === 'true',
      );
      const hasRecalledUnknown = containsFacts.some(
        (f) => typeof f.object === 'string' && recalled.has(f.object) && f.truth === 'unknown',
      );
      if (hasRecalledTrue) statuses[productId] = 'affected';
      else if (hasRecalledUnknown) statuses[productId] = 'uncertain';
      else if (
        recalled.size > 0 &&
        allDocsScanned &&
        this.scanned.has(productId) &&
        cluesRecorded(productId)
      ) {
        statuses[productId] = 'safe';
      } else statuses[productId] = 'pending';
    }
    return statuses;
  }

  /** Wave 1 is done when every product has a determination — time to Act. */
  readyToCommit(): boolean {
    return (
      this.currentPhase === 'investigate' &&
      Object.values(this.productStatuses()).every((s) => s !== 'pending')
    );
  }

  /**
   * Commit the recall report (#53 embryo). The interesting decision is the
   * uncertain product: hold it (unknown stays unknown) or clear it (treating
   * unknown as false) — [I5-D3]'s designed harm beat.
   */
  commit(decisions: Record<string, RecallDecision>): boolean {
    if (!this.readyToCommit()) return false;
    for (const productId of PRODUCT_IDS) {
      if (!decisions[productId]) return false;
    }
    this.decisions = { ...decisions };
    this.currentPhase = 'verification';
    return true;
  }

  /** Consequence Preview lines (§3.1): what the model predicts per decision. */
  static previewOf(decision: RecallDecision, status: ProductStatus): string {
    if (decision === 'pull') return 'removed from sale; recall notice posted at the shelf';
    if (decision === 'hold') return 'moved to the backroom until the lab confirms either way';
    if (decision === 'clear')
      return status === 'uncertain'
        ? 'stays on sale — if the lab disagrees, customers are exposed'
        : 'stays on sale';
    return 'no action — stays as is';
  }

  /** Field Verification resolves once the lab's findings are in the model. */
  canCloseCase(): boolean {
    if (this.currentPhase !== 'verification') return false;
    const waveTwoScanned = ENTITIES.filter((e) => (e.wave ?? 1) === 2 && this.scanned.has(e.id));
    if (waveTwoScanned.length === 0) return false;
    return waveTwoScanned.every((entity) =>
      [...this.clues.values()]
        .filter((clue) => clue.sourceId === entity.id)
        .every((clue) => clue.recordedTruth),
    );
  }

  closeCase(): boolean {
    if (!this.canCloseCase()) return false;
    this.currentPhase = 'debrief';
    return true;
  }

  debrief(): DebriefView | null {
    if (this.currentPhase !== 'debrief') return null;

    const finalStatus = this.productStatuses();
    const rows: DebriefRow[] = PRODUCT_IDS.map((productId) => {
      const productLabel = LABELS[productId] ?? productId;
      const decision = this.decisions[productId] ?? 'leave';
      const nowAffected = finalStatus[productId] === 'affected';
      const wasCleared = decision === 'clear' || decision === 'leave';
      const harm = nowAffected && wasCleared;
      const fieldResult = nowAffected
        ? 'the lab confirmed it contains the recalled ingredient'
        : 'the lab found no recalled ingredient';
      const note = harm
        ? 'It was on sale when the lab results landed — the model never justified clearing it.'
        : nowAffected
          ? decision === 'pull'
            ? 'Pulled before verification — exactly right.'
            : 'Held until the lab confirmed — nobody was exposed.'
          : 'No action needed, and none taken.';
      return {
        entityId: productId,
        label: productLabel,
        decision,
        fieldResult,
        verdict: harm ? 'harm' : 'right',
        note,
      };
    });

    const harm = rows.some((r) => r.verdict === 'harm');

    // Grade the hidden competency battery against the player's model (#57):
    // structure-agnostic by construction — only answers count.
    const results: CompetencyResult[] = COMPETENCY_QUESTIONS.map((question) => ({
      id: question.id,
      prompt: questionPrompt(question),
      passed: gradeQuestion(this.result, question).passed,
    }));

    return {
      rows,
      harm,
      anchorOutcome: harm ? DEBRIEF_TEXTS.anchorHarm : DEBRIEF_TEXTS.anchorSafe,
      reworkNote: DEBRIEF_TEXTS.rework,
      competency: {
        passed: results.filter((r) => r.passed).length,
        total: results.length,
        results,
      },
    };
  }

  // --- The Test verb: sentence-based queries over the model (#27/#51) -----

  /**
   * Slot options for "Which products contain [___]?" — only things the model
   * has SEEN as contained (the builder quietly teaches what fits where).
   */
  containsSlotOptions(): { id: string; label: string }[] {
    const seen = new Set<string>();
    for (const f of [...this.result.base, ...this.result.derived]) {
      if (f.predicate === 'contains' && typeof f.object === 'string') seen.add(f.object);
    }
    return [...seen].sort().map((id) => ({ id, label: LABELS[id] ?? id }));
  }

  /** "Which products contain X?" — tri-state answers with supports. */
  queryProductsContaining(objectId: string): QueryResultView[] {
    return this.runProductQuery([
      { subject: v('p'), predicate: c('contains'), object: c(objectId) },
    ]);
  }

  /** "Which products are sold at FreshMart #12?" */
  queryProductsSoldHere(): QueryResultView[] {
    return this.runProductQuery([{ subject: v('p'), predicate: c('soldAt'), object: c(STORE_ID) }]);
  }

  private runProductQuery(where: Parameters<typeof select>[1]['where']): QueryResultView[] {
    const products = new Set<string>(PRODUCT_IDS);
    const answers = select(this.result, { select: ['p'], where }).filter(
      (ans) => typeof ans.binding['p'] === 'string' && products.has(ans.binding['p'] as string),
    );
    return answers.map((ans) => {
      const entityId = ans.binding['p'] as string;
      const supports = ans.supports.map((f) => {
        const derived = this.result.derived.find((d) => d.id === f.id);
        const suffix = f.truth === 'unknown' ? ' — unknown' : derived ? ' — inferred' : '';
        return `${factText(f)}${suffix}`;
      });
      // For inferred supports, add the ground evidence behind them.
      const groundLines = ans.supports
        .filter((f) => this.result.derived.some((d) => d.id === f.id))
        .flatMap((f) => this.groundTexts(f.id));
      return {
        entityId,
        label: LABELS[entityId] ?? entityId,
        truth: ans.truth,
        supports: [...new Set([...supports, ...groundLines])],
      };
    });
  }
}

export interface QueryResultView {
  readonly entityId: string;
  readonly label: string;
  readonly truth: 'true' | 'unknown';
  /** Support lines — for unknown answers these ARE the missing evidence. */
  readonly supports: readonly string[];
}
