import {
  AssertionLog,
  VOCAB,
  explain,
  infer,
  type Assertion,
  type ExplanationNode,
  type Fact,
  type InferenceResult,
  type TruthValue,
} from '@ontologist/semantic-engine';
import {
  ENTITIES,
  LABELS,
  ONTOLOGY_FACTS,
  PRODUCT_IDS,
  RECALLED_CLASS,
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

export class CaseSession {
  private readonly log = new AssertionLog();
  private readonly entities = new Map(ENTITIES.map((e) => [e.id, e]));
  private readonly scanned = new Set<string>();
  private result: InferenceResult;
  private seq = 0;

  constructor() {
    for (const fact of ONTOLOGY_FACTS) this.assert(fact, { kind: 'scenario' });
    this.result = infer(this.log);
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
    return this.entities.size;
  }

  scan(entityId: string): ScanOutcome | null {
    const entity = this.entities.get(entityId);
    if (!entity) return null;

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

    const allDocsScanned = ENTITIES.filter((e) => e.kind === 'document').every((e) =>
      this.scanned.has(e.id),
    );

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

  caseComplete(): boolean {
    return Object.values(this.productStatuses()).every((s) => s !== 'pending');
  }
}
