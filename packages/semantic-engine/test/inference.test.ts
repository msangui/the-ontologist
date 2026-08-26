import { describe, expect, it } from 'vitest';
import {
  AssertionLog,
  VOCAB,
  explain,
  holdsTrue,
  infer,
  type Assertion,
  type ExplanationNode,
  type TruthValue,
} from '../src/index.js';

let seq = 0;
const a = (
  subject: string,
  predicate: string,
  object: string | number | boolean,
  truth: TruthValue = 'true',
): Assertion => ({
  id: `a${(seq += 1)}`,
  subject,
  predicate,
  object,
  truth,
  provenance: { kind: 'evidence', evidenceId: `ev:${seq}` },
});

const logOf = (...assertions: Assertion[]): AssertionLog => {
  const log = new AssertionLog();
  for (const assertion of assertions) log.assert(assertion);
  return log;
};

describe('R-subclass + R-typing', () => {
  it('propagates instanceOf through a subclass chain', () => {
    const result = infer(
      logOf(
        a('class:OatBites', VOCAB.subclassOf, 'class:Snack'),
        a('class:Snack', VOCAB.subclassOf, 'class:Product'),
        a('product:oat-bites-6', VOCAB.instanceOf, 'class:OatBites'),
      ),
    );
    expect(holdsTrue(result, 'class:OatBites', VOCAB.subclassOf, 'class:Product')).toBe(true);
    expect(holdsTrue(result, 'product:oat-bites-6', VOCAB.instanceOf, 'class:Snack')).toBe(true);
    expect(holdsTrue(result, 'product:oat-bites-6', VOCAB.instanceOf, 'class:Product')).toBe(true);
  });
});

describe('R-domain / R-range', () => {
  it('types both endpoints of a declared relationship', () => {
    const result = infer(
      logOf(
        a('suppliedBy', VOCAB.domain, 'class:Ingredient'),
        a('suppliedBy', VOCAB.range, 'class:Supplier'),
        a('ingredient:cocoa', 'suppliedBy', 'supplier:northstar'),
      ),
    );
    expect(holdsTrue(result, 'ingredient:cocoa', VOCAB.instanceOf, 'class:Ingredient')).toBe(true);
    expect(holdsTrue(result, 'supplier:northstar', VOCAB.instanceOf, 'class:Supplier')).toBe(true);
  });

  it('never types literal objects', () => {
    const result = infer(
      logOf(a('packCount', VOCAB.range, 'class:Number'), a('product:x', 'packCount', 6)),
    );
    expect(result.derived.filter((f) => f.derivation.ruleId === 'R-range')).toHaveLength(0);
  });
});

describe('R-inverse', () => {
  it('derives the inverse in both declaration directions, truth carried', () => {
    const result = infer(
      logOf(
        a('sells', VOCAB.inverseOf, 'soldAt'),
        a('store:fm-12', 'sells', 'product:oat-bites-6'),
        a('product:granola', 'soldAt', 'store:fm-12', 'unknown'),
        a('product:recalled-lot', 'soldAt', 'store:fm-12', 'false'),
      ),
    );
    expect(holdsTrue(result, 'product:oat-bites-6', 'soldAt', 'store:fm-12')).toBe(true);
    const unknownInverse = result.derived.find(
      (f) =>
        f.subject === 'store:fm-12' && f.predicate === 'sells' && f.object === 'product:granola',
    );
    expect(unknownInverse?.truth).toBe('unknown');
    const falseInverse = result.derived.find(
      (f) =>
        f.subject === 'store:fm-12' &&
        f.predicate === 'sells' &&
        f.object === 'product:recalled-lot',
    );
    expect(falseInverse?.truth).toBe('false');
  });
});

describe('R-transitive', () => {
  it('closes a declared-transitive chain and terminates on cycles', () => {
    const result = infer(
      logOf(
        a('partOfCategory', VOCAB.transitiveProperty, true),
        a('cat:oat-snacks', 'partOfCategory', 'cat:snacks'),
        a('cat:snacks', 'partOfCategory', 'cat:food'),
        a('cat:food', 'partOfCategory', 'cat:oat-snacks'), // cycle — must not hang
      ),
    );
    expect(holdsTrue(result, 'cat:oat-snacks', 'partOfCategory', 'cat:food')).toBe(true);
    expect(holdsTrue(result, 'cat:food', 'partOfCategory', 'cat:snacks')).toBe(true);
  });

  it('does not chain undeclared properties', () => {
    const result = infer(logOf(a('x', 'linksTo', 'y'), a('y', 'linksTo', 'z')));
    expect(holdsTrue(result, 'x', 'linksTo', 'z')).toBe(false);
  });
});

describe('contradiction detection (truth-conflict)', () => {
  it('flags a derived true colliding with an explicit false', () => {
    // The unknown-vs-false shape: the player asserted "not sold here", but
    // the inverse of a store manifest says otherwise.
    const result = infer(
      logOf(
        a('sells', VOCAB.inverseOf, 'soldAt'),
        a('store:fm-12', 'sells', 'product:oat-bites-6'),
        a('product:oat-bites-6', 'soldAt', 'store:fm-12', 'false'),
      ),
    );
    // The conflict is visible from both directions: the claim itself, and its
    // mirror through the inverse property. Both are real; collapsing mirrored
    // conflicts into one player-facing red thread is root-cause grouping (#23/#58).
    expect(result.contradictions).toHaveLength(2);
    const subjects = result.contradictions.map((c) => c.subject).sort();
    expect(subjects).toEqual(['product:oat-bites-6', 'store:fm-12']);
    for (const conflict of result.contradictions) {
      expect(conflict.kind).toBe('truth-conflict');
      expect(conflict.factIds.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('does not flag unknown against true (unknown ≠ false)', () => {
    const result = infer(
      logOf(
        a('product:x', 'soldAt', 'store:s', 'true'),
        a('product:x', 'contains', 'ingredient:i', 'unknown'),
      ),
    );
    expect(result.contradictions).toHaveLength(0);
  });
});

describe('determinism', () => {
  it('produces identical results regardless of assertion order', () => {
    const build = (order: number[]): string => {
      const parts = [
        a('class:A', VOCAB.subclassOf, 'class:B'),
        a('class:B', VOCAB.subclassOf, 'class:C'),
        a('e:1', VOCAB.instanceOf, 'class:A'),
        a('rel', VOCAB.inverseOf, 'ler'),
        a('e:1', 'rel', 'e:2'),
        a('hop', VOCAB.transitiveProperty, true),
        a('n:1', 'hop', 'n:2'),
        a('n:2', 'hop', 'n:3'),
      ];
      // Re-id so ids don't encode insertion order differences.
      const stable = parts.map((p, i) => ({ ...p, id: `s${i}` }));
      const log = new AssertionLog();
      for (const i of order) log.assert(stable[i]!);
      const { derived, contradictions } = infer(log);
      return JSON.stringify({ derived, contradictions });
    };

    const forward = build([0, 1, 2, 3, 4, 5, 6, 7]);
    const shuffled = build([7, 3, 5, 0, 6, 2, 4, 1]);
    expect(shuffled).toBe(forward);
  });
});

describe('explanations (pillar 3)', () => {
  it('unfolds a derived fact to ground assertions', () => {
    const inst = a('product:p', VOCAB.instanceOf, 'class:Sub');
    const sub = a('class:Sub', VOCAB.subclassOf, 'class:Mid');
    const mid = a('class:Mid', VOCAB.subclassOf, 'class:Top');
    const result = infer(logOf(inst, sub, mid));

    const topTyping = result.derived.find(
      (f) => f.predicate === VOCAB.instanceOf && f.object === 'class:Top',
    );
    expect(topTyping).toBeDefined();

    const tree = explain(result, topTyping!.id);
    const groundIds: string[] = [];
    const collect = (node: ExplanationNode): void => {
      if (node.premises.length === 0) groundIds.push(node.factId);
      node.premises.forEach(collect);
    };
    collect(tree);

    expect(new Set(groundIds)).toEqual(new Set([inst.id, sub.id, mid.id]));
    expect(tree.ruleId).toBeDefined();
  });

  it('rejects unknown fact ids', () => {
    const result = infer(logOf(a('x', 'y', 'z')));
    expect(() => explain(result, 'nope')).toThrow(/Unknown fact id/);
  });
});

describe('integration: recall propagation shape', () => {
  it('answers "which stores sell something containing the recalled ingredient"', () => {
    const result = infer(
      logOf(
        // Ontology
        a('contains', VOCAB.transitiveProperty, true),
        a('sells', VOCAB.inverseOf, 'soldAt'),
        a('contains', VOCAB.domain, 'class:Product'),
        // World
        a('product:oat-bites-6', 'contains', 'mix:oat-base'),
        a('mix:oat-base', 'contains', 'ingredient:cocoa'),
        a('product:oat-bites-6', 'soldAt', 'store:fm-12'),
      ),
    );
    // Transitive containment reaches the recalled ingredient…
    expect(holdsTrue(result, 'product:oat-bites-6', 'contains', 'ingredient:cocoa')).toBe(true);
    // …the inverse gives the store's view…
    expect(holdsTrue(result, 'store:fm-12', 'sells', 'product:oat-bites-6')).toBe(true);
    // …and domain typing classifies the product without anyone saying so.
    expect(holdsTrue(result, 'product:oat-bites-6', VOCAB.instanceOf, 'class:Product')).toBe(true);
  });
});
