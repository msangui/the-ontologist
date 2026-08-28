/**
 * Well-known predicates the rule engine interprets (backlog #21/#22).
 *
 * Ontology statements are ordinary assertions in the log — players edit the
 * ontology in Model View, so classes and property declarations must be
 * event-sourced exactly like instance data. The engine gives these predicates
 * inferential meaning; everything else is domain vocabulary.
 */
export const VOCAB = {
  /** instanceOf(x, C): entity x has kind C. */
  instanceOf: 'instanceOf',
  /** subclassOf(A, B): every A is a B. Transitive by definition. */
  subclassOf: 'subclassOf',
  /** domain(p, C): whatever has an outgoing p is a C. */
  domain: 'domain',
  /** range(p, C): whatever has an incoming p is a C. */
  range: 'range',
  /** inverseOf(p, q): p(x,y) holds exactly when q(y,x) holds. */
  inverseOf: 'inverseOf',
  /** transitiveProperty(p, true): p chains — p(x,y) ∧ p(y,z) → p(x,z). */
  transitiveProperty: 'transitiveProperty',
  /**
   * sameAs(a, b): a and b are the same entity. Symmetric and transitive;
   * facts transfer both ways WITHOUT moving the originals — retracting the
   * sameAs un-derives every transferred fact (split with evidence retention,
   * [I4-D5]).
   */
  sameAs: 'sameAs',
} as const;

export type VocabPredicate = (typeof VOCAB)[keyof typeof VOCAB];
