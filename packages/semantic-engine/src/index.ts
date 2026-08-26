export type {
  Assertion,
  AssertionId,
  EntityId,
  LogEvent,
  PredicateId,
  Provenance,
  TruthValue,
  ValidityInterval,
} from './types.js';
export { AssertionLog } from './assertion-log.js';
export { VOCAB, type VocabPredicate } from './vocabulary.js';
export {
  explain,
  holdsTrue,
  infer,
  type Contradiction,
  type Derivation,
  type DerivedFact,
  type ExplanationNode,
  type Fact,
  type InferenceResult,
} from './inference.js';
