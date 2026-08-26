import type { Fact, InferenceResult } from './inference.js';

/**
 * Internal query pattern matcher (backlog #27) — the compilation target for
 * the sentence-based query builder and the competency-question batteries.
 * Explicitly NOT a SPARQL engine (§18.5): conjunctive patterns with variables,
 * evaluated over base + derived facts, answering in tri-state.
 *
 * Semantics:
 * - An answer is `true` when every pattern is supported by a `true` fact.
 * - An answer is `unknown` when it needs at least one `unknown` fact — the
 *   unknown supports ARE the missing evidence ("what would resolve this").
 * - Explicitly `false` facts never support an answer (open world: false ≠ absent).
 * - Results are deterministic: stable ordering, `true` beats `unknown` on ties.
 */

export type Term =
  | { readonly kind: 'var'; readonly name: string }
  | { readonly kind: 'const'; readonly value: string | number | boolean };

export interface Pattern {
  readonly subject: Term;
  readonly predicate: Term;
  readonly object: Term;
}

export interface Query {
  /** Variable names projected into answers. */
  readonly select: readonly string[];
  readonly where: readonly Pattern[];
}

export type Binding = Readonly<Record<string, string | number | boolean>>;

export interface QueryAnswer {
  readonly binding: Binding;
  readonly truth: 'true' | 'unknown';
  /** The facts that matched each pattern (explanation entry points). */
  readonly supports: readonly Fact[];
}

/** Term builders, for readable query construction. */
export const v = (name: string): Term => ({ kind: 'var', name });
export const c = (value: string | number | boolean): Term => ({ kind: 'const', value });

const factKey = (f: Fact): string =>
  `${f.subject} ${f.predicate} ${typeof f.object}:${String(f.object)} ${f.truth} ${f.id}`;

function unifyTerm(
  term: Term,
  value: string | number | boolean,
  binding: Record<string, string | number | boolean>,
): boolean {
  if (term.kind === 'const') return term.value === value;
  const bound = binding[term.name];
  if (bound === undefined) {
    binding[term.name] = value;
    return true;
  }
  return bound === value;
}

function unify(pattern: Pattern, fact: Fact, binding: Binding): Binding | null {
  const next: Record<string, string | number | boolean> = { ...binding };
  if (!unifyTerm(pattern.subject, fact.subject, next)) return null;
  if (!unifyTerm(pattern.predicate, fact.predicate, next)) return null;
  if (!unifyTerm(pattern.object, fact.object, next)) return null;
  return next;
}

/** Evaluate a select query. Never mutates the result it reads. */
export function select(result: InferenceResult, query: Query): QueryAnswer[] {
  // Positive matching considers true and unknown facts; false never supports.
  const facts = [...result.base, ...result.derived]
    .filter((f) => f.truth !== 'false')
    .sort((a, b) => (factKey(a) < factKey(b) ? -1 : 1));

  const answers = new Map<string, QueryAnswer>();

  const record = (binding: Binding, supports: readonly Fact[]): void => {
    const projected: Record<string, string | number | boolean> = {};
    for (const name of query.select) {
      const value = binding[name];
      if (value === undefined) return; // unbound select var → not an answer
      projected[name] = value;
    }
    const truth = supports.every((f) => f.truth === 'true') ? 'true' : 'unknown';
    const key = JSON.stringify(query.select.map((name) => projected[name]));
    const existing = answers.get(key);
    if (existing && (existing.truth === 'true' || truth === 'unknown')) return;
    answers.set(key, { binding: projected, truth, supports: [...supports] });
  };

  const walk = (index: number, binding: Binding, supports: readonly Fact[]): void => {
    const pattern = query.where[index];
    if (!pattern) {
      record(binding, supports);
      return;
    }
    for (const fact of facts) {
      const next = unify(pattern, fact, binding);
      if (next) walk(index + 1, next, [...supports, fact]);
    }
  };

  walk(0, {}, []);
  return [...answers.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, answer]) => answer);
}

/**
 * Yes/no query: `true` if a fully-true answer exists; `unknown` if only
 * unknown-supported answers exist; `false` only when a fully-ground pattern
 * is explicitly contradicted; otherwise `unknown` (open world — absence of
 * evidence is not evidence of absence).
 */
export function ask(result: InferenceResult, query: Query): 'true' | 'false' | 'unknown' {
  const answers = select(result, { ...query, select: [] });
  if (answers.some((a) => a.truth === 'true')) return 'true';
  if (answers.some((a) => a.truth === 'unknown')) return 'unknown';

  const explicitlyFalse = [...result.base, ...result.derived].filter((f) => f.truth === 'false');
  const groundedFalse = query.where.some(
    (p) =>
      p.subject.kind === 'const' &&
      p.predicate.kind === 'const' &&
      p.object.kind === 'const' &&
      explicitlyFalse.some(
        (f) =>
          f.subject === (p.subject as { value: unknown }).value &&
          f.predicate === (p.predicate as { value: unknown }).value &&
          f.object === (p.object as { value: unknown }).value,
      ),
  );
  return groundedFalse ? 'false' : 'unknown';
}
