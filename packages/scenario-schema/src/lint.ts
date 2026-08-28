import {
  AssertionLog,
  ask,
  infer,
  select,
  type Assertion,
  type InferenceResult,
  type Query,
} from '@ontologist/semantic-engine';
import type { CompetencyQuestion, Scenario, ScenarioFact } from './index.js';

/**
 * Casewright semantic lint (backlog #31): beyond shape validation, prove
 * properties of the scenario by running the real engine over the INTENDED
 * model (ontology + every scan fact, both waves). A scenario that fails
 * lint cannot ship [I8-D2].
 */

export interface LintFinding {
  readonly rule: string;
  readonly severity: 'error' | 'warning';
  readonly message: string;
}

export interface LintReport {
  readonly ok: boolean;
  readonly findings: readonly LintFinding[];
}

/** Assemble the intended final model: everything knowable in the case. */
export function intendedModel(scenario: Scenario): InferenceResult {
  const log = new AssertionLog();
  let seq = 0;
  const assert = (fact: ScenarioFact, provenance: Assertion['provenance']): void => {
    log.assert({
      id: `lint:${(seq += 1)}`,
      subject: fact.subject,
      predicate: fact.predicate,
      object: fact.object,
      truth: fact.truth ?? 'true',
      provenance,
    });
  };
  for (const fact of scenario.ontologyFacts) assert(fact, { kind: 'scenario' });
  for (const entity of scenario.entities) {
    for (const fact of entity.scanFacts) {
      assert(fact, { kind: 'evidence', evidenceId: entity.id });
    }
  }
  // The intended solution includes the player's own modeling actions.
  for (const fact of scenario.intendedActions) assert(fact, { kind: 'player' });
  return infer(log);
}

const toQuery = (question: CompetencyQuestion): Query =>
  question.kind === 'select'
    ? { select: question.select, where: question.where }
    : { select: [], where: question.where };

/**
 * Grade one competency question against a model (#57, structure-agnostic:
 * only answers matter, never model shape). Exact answer-set match for
 * select questions; tri-state equality for ask questions.
 */
export function gradeQuestion(
  result: InferenceResult,
  question: CompetencyQuestion,
): { passed: boolean; detail: string } {
  if (question.kind === 'ask') {
    const answer = ask(result, toQuery(question));
    return {
      passed: answer === question.expectedTruth,
      detail: `expected ${question.expectedTruth}, got ${answer}`,
    };
  }

  const answers = select(result, toQuery(question));
  const canonical = (binding: Record<string, string | number | boolean>, truth: string): string =>
    `${question.select.map((name) => `${typeof binding[name]}:${String(binding[name])}`).join('|')}=${truth}`;
  const got = new Set(answers.map((a) => canonical(a.binding, a.truth)));
  const want = new Set(question.expected.map((e) => canonical(e.binding, e.truth)));
  const missing = [...want].filter((k) => !got.has(k));
  const extra = [...got].filter((k) => !want.has(k));
  return {
    passed: missing.length === 0 && extra.length === 0,
    detail:
      missing.length === 0 && extra.length === 0
        ? 'exact match'
        : `missing: [${missing.join(', ')}] unexpected: [${extra.join(', ')}]`,
  };
}

/** All semantic lint rules over a shape-valid scenario. */
export function lintScenario(scenario: Scenario): LintReport {
  const findings: LintFinding[] = [];
  const error = (rule: string, message: string) =>
    findings.push({ rule, severity: 'error', message });
  const warning = (rule: string, message: string) =>
    findings.push({ rule, severity: 'warning', message });

  // Rule: every string key referenced anywhere must exist (localization lint).
  const keys = new Set(Object.keys(scenario.strings));
  const requireKey = (key: string, where: string) => {
    if (!keys.has(key)) error('string-keys', `Missing string for key "${key}" (${where}).`);
  };
  requireKey(scenario.titleKey, 'titleKey');
  requireKey(scenario.humanAnchor.nameKey, 'humanAnchor.nameKey');
  requireKey(scenario.humanAnchor.harmKey, 'humanAnchor.harmKey');
  requireKey(scenario.debriefKeys.anchorSafeKey, 'debriefKeys');
  requireKey(scenario.debriefKeys.anchorHarmKey, 'debriefKeys');
  requireKey(scenario.debriefKeys.reworkKey, 'debriefKeys');
  for (const entity of scenario.entities) requireKey(entity.blurbKey, `entity ${entity.id}`);
  for (const question of scenario.competencyQuestions)
    requireKey(question.promptKey, `question ${question.id}`);
  for (const [id, key] of Object.entries(scenario.labels)) requireKey(key, `label for ${id}`);
  for (const [id, key] of Object.entries(scenario.notes)) requireKey(key, `note for ${id}`);
  for (const classId of scenario.modelClasses) {
    if (!scenario.labels[classId])
      error('labels', `Model class "${classId}" has no display label.`);
  }
  for (const candidateId of scenario.modelCandidates) {
    if (!scenario.labels[candidateId])
      error('labels', `Model candidate "${candidateId}" has no display label.`);
  }

  // Rule: every world id that appears in a fact should have a display label.
  const labeled = new Set(Object.keys(scenario.labels));
  const allFacts = [
    ...scenario.ontologyFacts,
    ...scenario.entities.flatMap((entity) => entity.scanFacts),
  ];
  for (const fact of allFacts) {
    for (const id of [fact.subject, typeof fact.object === 'string' ? fact.object : null]) {
      if (id && id.includes(':') && !labeled.has(id)) {
        warning('labels', `World id "${id}" appears in facts but has no display label.`);
      }
    }
  }

  // Rule: the Field Verification wave must exist and carry evidence.
  const waveTwo = scenario.entities.filter((entity) => entity.wave === 2);
  if (waveTwo.length === 0) {
    error('stress-wave', 'No wave-2 evidence: the Field Verification wave is unreachable.');
  }

  // Rule: every competency question must be answerable from the intended model.
  const model = intendedModel(scenario);
  for (const question of scenario.competencyQuestions) {
    const grade = gradeQuestion(model, question);
    if (!grade.passed) {
      error(
        'competency',
        `Question "${question.id}" fails against the intended model: ${grade.detail}.`,
      );
    }
  }

  // Rule: entity ids must be unique.
  const seen = new Set<string>();
  for (const entity of scenario.entities) {
    if (seen.has(entity.id)) error('entity-ids', `Duplicate entity id "${entity.id}".`);
    seen.add(entity.id);
  }

  return { ok: !findings.some((f) => f.severity === 'error'), findings };
}
