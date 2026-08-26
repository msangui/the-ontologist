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
import {
  ANCHOR_NAME,
  ENTITIES,
  LABELS,
  ONTOLOGY_FACTS,
  PRODUCT_IDS,
  RECALLED_CLASS,
  STORE_ID,
  type ProtoEntity,
  type ScanFact,
} from './protoCase';

/**
 * The proto-case play session: the game-validation layer in miniature
 * (backlog #42/#56 embryo). Scans append assertions to the event-sourced log,
 * inference re-runs, and the UI reads humanized views. No Babylon, no React —
 * this module could run in the text harness (#33) unchanged.
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

export interface DebriefView {
  readonly rows: readonly DebriefRow[];
  readonly anchorOutcome: string;
  readonly harm: boolean;
  readonly reworkNote: string;
}

export interface ScanOutcome {
  readonly entity: ProtoEntity;
  /** What this scan recorded, plus what the engine newly concluded. */
  readonly learned: readonly FactView[];
  readonly inferred: readonly FactView[];
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
};

const factText = (f: Fact): string => {
  if (f.predicate === VOCAB.transitiveProperty)
    return `“${label(f.subject)}” carries through parts`;
  const verb = PREDICATE_TEXT[f.predicate] ?? f.predicate;
  return `${label(f.subject)} ${verb} ${label(f.object)}`;
};

/** Versioned save shape (#62): the assertion log IS the model save (§18.7). */
export interface CaseSnapshot {
  readonly saveVersion: 1;
  readonly log: string;
  readonly scannedIds: readonly string[];
  readonly phase: CasePhase;
  readonly decisions: Readonly<Record<string, RecallDecision>>;
  readonly seq: number;
}

export class CaseSession {
  private readonly log: AssertionLog;
  private readonly entities = new Map(ENTITIES.map((e) => [e.id, e]));
  private readonly scanned = new Set<string>();
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
    } else {
      this.log = new AssertionLog();
      for (const fact of ONTOLOGY_FACTS) this.assert(fact, { kind: 'scenario' });
    }
    this.result = infer(this.log);
  }

  snapshot(): CaseSnapshot {
    return {
      saveVersion: 1,
      log: this.log.serialize(),
      scannedIds: [...this.scanned],
      phase: this.currentPhase,
      decisions: { ...this.decisions },
      seq: this.seq,
    };
  }

  /** Restore from a snapshot; null on anything corrupt (never a crash). */
  static restore(snapshot: unknown): CaseSession | null {
    try {
      const snap = snapshot as CaseSnapshot;
      if (
        !snap ||
        snap.saveVersion !== 1 ||
        typeof snap.log !== 'string' ||
        !Array.isArray(snap.scannedIds) ||
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

  private assert(fact: ScanFact, provenance: Assertion['provenance']): void {
    this.log.assert({
      id: `f:${(this.seq += 1)}`,
      subject: fact.subject,
      predicate: fact.predicate,
      object: fact.object,
      truth: fact.truth ?? 'true',
      provenance,
    });
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

  scan(entityId: string): ScanOutcome | null {
    const entity = this.entities.get(entityId);
    if (!entity || !this.isAvailable(entityId)) return null;

    if (this.scanned.has(entityId)) {
      return { entity, learned: [], inferred: [] };
    }
    this.scanned.add(entityId);

    const derivedBefore = new Set(this.result.derived.map((f) => f.id));
    const baseBefore = new Set(this.result.base.map((f) => f.id));
    for (const fact of entity.scanFacts) {
      this.assert(fact, { kind: 'evidence', evidenceId: entityId });
    }
    this.result = infer(this.log);

    const learned = this.result.base
      .filter((f) => !baseBefore.has(f.id))
      .map((f) => this.viewOfBase(f));
    const inferred = this.result.derived
      .filter((f) => !derivedBefore.has(f.id))
      .map((f) => this.viewOfDerived(f.id, f));

    // Resolve: scanning the Field Verification evidence closes the case.
    if (this.currentPhase === 'verification' && (entity.wave ?? 1) === 2) {
      this.currentPhase = 'debrief';
    }

    return { entity, learned, inferred };
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

  /** Everything the Journal shows: evidence facts first, then inferences. */
  journal(): FactView[] {
    const base = this.result.base
      .filter((a) => a.provenance.kind === 'evidence')
      .map((a) => this.viewOfBase(a));
    const derived = this.result.derived
      // The player-facing feed: skip mirror facts (inverse bookkeeping).
      .filter((f) => f.derivation.ruleId !== 'R-inverse')
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
      this.result.contradictions.map((c) => {
        const evidence = new Set<string>();
        for (const id of c.factIds) collectEvidence(id, evidence);
        return [...evidence].sort().join('~');
      }),
    );
    return keys.size;
  }

  /** The case question: which products are affected by the recall? */
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
      else if (this.scanned.has(productId) && allDocsScanned) statuses[productId] = 'safe';
      else statuses[productId] = 'pending';
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

  debrief(): DebriefView | null {
    if (this.currentPhase !== 'debrief') return null;

    const finalStatus = this.productStatuses();
    const rows: DebriefRow[] = PRODUCT_IDS.map((productId) => {
      const label = LABELS[productId] ?? productId;
      const decision = this.decisions[productId] ?? 'leave';
      const nowAffected = finalStatus[productId] === 'affected';
      const wasCleared = decision === 'clear' || decision === 'leave';
      const harm = nowAffected && wasCleared;
      const fieldResult = nowAffected
        ? 'the lab confirmed it contains the recalled ingredient'
        : 'the lab found no recalled ingredient';
      const note = harm
        ? `Cleared while the model said “unknown” — it was on sale when the lab results landed.`
        : nowAffected
          ? decision === 'pull'
            ? 'Pulled before verification — exactly right.'
            : 'Held until the lab confirmed — nobody was exposed.'
          : 'No action needed, and none taken.';
      return {
        entityId: productId,
        label,
        decision,
        fieldResult,
        verdict: harm ? 'harm' : 'right',
        note,
      };
    });

    const harm = rows.some((r) => r.verdict === 'harm');
    return {
      rows,
      harm,
      anchorOutcome: harm
        ? `${ANCHOR_NAME} — the shopper with the tree-nut allergy — bought the cleared product before the lab results arrived. “Unknown” was never “safe.”`
        : `${ANCHOR_NAME} — the shopper with the tree-nut allergy — shopped safely. The uncertain product stayed off her cart until the lab spoke.`,
      reworkNote:
        'Field Verification resolved the unknowns without breaking your model — new evidence filled gaps the model had already marked. That is what a model that represents reality looks like.',
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
