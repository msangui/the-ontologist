import {
  validateScenario,
  type CompetencyQuestion,
  type Scenario,
  type ScenarioFact,
} from '@ontologist/scenario-schema';
import rawScenario from './recall-at-freshmart.scenario.json';

/**
 * Case loader (backlog #30): the case is DATA, not code. The JSON scenario is
 * validated against Scenario Schema v1 at boot (fail loud, fail early — the
 * same file is proven solvable by Casewright in CI, #31).
 */

const validation = validateScenario(rawScenario);
if (!validation.ok) {
  const details = validation.issues.map((i) => `  ${i.path}: ${i.message}`).join('\n');
  throw new Error(`Scenario failed schema validation:\n${details}`);
}

export const SCENARIO: Scenario = validation.scenario;

const text = (key: string): string => SCENARIO.strings[key] ?? key;

export type ScanFact = ScenarioFact;

export interface ProtoEntity {
  readonly id: string;
  readonly label: string;
  readonly kind: 'product' | 'document';
  readonly position: readonly [number, number];
  readonly blurb: string;
  readonly scanFacts: readonly ScanFact[];
  readonly wave?: 1 | 2;
}

export const STORE_ID = SCENARIO.params.storeId;
export const RECALLED_CLASS = SCENARIO.params.recalledClassId;
export const ANCHOR_NAME = text(SCENARIO.humanAnchor.nameKey);
export const CASE_TITLE = text(SCENARIO.titleKey);

export const ONTOLOGY_FACTS: readonly ScanFact[] = SCENARIO.ontologyFacts;

/** World-id → display text (localization keys resolved to the inline locale). */
export const LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(SCENARIO.labels).map(([id, key]) => [id, text(key)]),
);

export const ENTITIES: readonly ProtoEntity[] = SCENARIO.entities.map((entity) => ({
  id: entity.id,
  label: LABELS[entity.id] ?? entity.id,
  kind: entity.kind,
  position: entity.position,
  blurb: text(entity.blurbKey),
  scanFacts: entity.scanFacts,
  ...(entity.wave ? { wave: entity.wave } : {}),
}));

export const PRODUCT_IDS = ENTITIES.filter((e) => e.kind === 'product').map((e) => e.id);

export const COMPETENCY_QUESTIONS: readonly CompetencyQuestion[] = SCENARIO.competencyQuestions;

export const DEBRIEF_TEXTS = {
  anchorSafe: text(SCENARIO.debriefKeys.anchorSafeKey),
  anchorHarm: text(SCENARIO.debriefKeys.anchorHarmKey),
  rework: text(SCENARIO.debriefKeys.reworkKey),
} as const;

export const questionPrompt = (question: CompetencyQuestion): string => text(question.promptKey);
