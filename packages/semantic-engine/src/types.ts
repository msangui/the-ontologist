/**
 * Core types of the semantic engine's typed property graph.
 *
 * The supported-semantics list is a contract (vision doc §18.5) changed only
 * by panel decision [I7-D1]. This file grows toward that contract; it never
 * grows past it.
 */

/** Stable identity shared across Lens, Journal, Model View, and the 3D scene. */
export type EntityId = string;

/** Property / relationship identifier (e.g. "soldAt", "contains", "instanceOf"). */
export type PredicateId = string;

/**
 * Tri-state truth is engine-native [I5-D3]. `unknown` is a first-class value:
 * the absence of an assertion is NOT the same as an explicit `false`.
 */
export type TruthValue = 'true' | 'false' | 'unknown';

/** Where a belief comes from. Every assertion carries provenance (pillar 3). */
export type Provenance =
  | { kind: 'evidence'; evidenceId: string }
  | { kind: 'npc'; npcId: string }
  | { kind: 'player' }
  | { kind: 'scenario' }
  | { kind: 'derived'; ruleId: string; premises: readonly AssertionId[] };

/** Optional temporal validity interval (§18.5). Open ends are omitted fields. */
export interface ValidityInterval {
  readonly from?: string;
  readonly to?: string;
}

/** Unique id of an assertion within a session log. */
export type AssertionId = string;

/** One subject–predicate–object claim with truth, provenance, and optional validity. */
export interface Assertion {
  readonly id: AssertionId;
  readonly subject: EntityId;
  readonly predicate: PredicateId;
  readonly object: EntityId | string | number | boolean;
  readonly truth: TruthValue;
  readonly provenance: Provenance;
  readonly validity?: ValidityInterval;
}

/**
 * The append-only log is the ONLY write path [I4-D2]. Retraction is an event,
 * never a mutation — undo, checkpoints, explanations, and deterministic replay
 * all depend on this.
 */
export type LogEvent =
  | { readonly seq: number; readonly kind: 'assert'; readonly assertion: Assertion }
  | { readonly seq: number; readonly kind: 'retract'; readonly assertionId: AssertionId };
