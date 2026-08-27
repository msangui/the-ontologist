import { z } from 'zod';

/**
 * Scenario Schema v1 (backlog #30) — the data contract for every case.
 *
 * Conventions (vision doc §19):
 * - All player-facing text is a localization key into `strings` (§18.10:
 *   keys from day one; `strings` carries the English locale inline for now).
 * - The human anchor is REQUIRED — a case without a named harmed person
 *   does not validate [I1-D5].
 * - Competency questions are stored in the engine's query IR and are the
 *   sole correctness mechanism [I5-D1]; Casewright proves them answerable
 *   from the intended model before a scenario can ship [I8-D2].
 */

export const truthValueSchema = z.enum(['true', 'false', 'unknown']);

export const factSchema = z.object({
  subject: z.string().min(1),
  predicate: z.string().min(1),
  object: z.union([z.string(), z.number(), z.boolean()]),
  truth: truthValueSchema.optional(),
  /**
   * Ambiguous evidence: the player must choose the truth value when
   * recording this clue (the authored `truth` is the intended reading).
   */
  ambiguous: z.boolean().optional(),
});

/** Query IR terms — mirrors @ontologist/semantic-engine's Term/Pattern. */
export const termSchema = z.union([
  z.object({ kind: z.literal('var'), name: z.string().min(1) }),
  z.object({
    kind: z.literal('const'),
    value: z.union([z.string(), z.number(), z.boolean()]),
  }),
]);

export const patternSchema = z.object({
  subject: termSchema,
  predicate: termSchema,
  object: termSchema,
});

export const competencyQuestionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('select'),
    id: z.string().min(1),
    promptKey: z.string().min(1),
    select: z.array(z.string().min(1)).min(1),
    where: z.array(patternSchema).min(1),
    /** Exact expected answer set against the intended final model. */
    expected: z.array(
      z.object({
        binding: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
        truth: z.enum(['true', 'unknown']),
      }),
    ),
  }),
  z.object({
    kind: z.literal('ask'),
    id: z.string().min(1),
    promptKey: z.string().min(1),
    where: z.array(patternSchema).min(1),
    expectedTruth: truthValueSchema,
  }),
]);

export const entitySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['product', 'document']),
  position: z.tuple([z.number(), z.number()]),
  blurbKey: z.string().min(1),
  wave: z.union([z.literal(1), z.literal(2)]).optional(),
  scanFacts: z.array(factSchema).min(1, 'A scannable with nothing to learn is orphan evidence.'),
});

export const scenarioSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  titleKey: z.string().min(1),
  params: z.object({
    storeId: z.string().min(1),
    recalledClassId: z.string().min(1),
  }),
  humanAnchor: z.object({
    nameKey: z.string().min(1),
    harmKey: z
      .string()
      .min(1)
      .describe('Key describing the concrete harm if the meaning failure persists.'),
  }),
  /** Localization table: key → text (English inline for now, §18.10). */
  strings: z.record(z.string(), z.string()),
  /** World-id → string key for display names. */
  labels: z.record(z.string(), z.string()),
  ontologyFacts: z.array(factSchema),
  entities: z.array(entitySchema).min(1),
  competencyQuestions: z.array(competencyQuestionSchema).min(1),
  debriefKeys: z.object({
    anchorSafeKey: z.string().min(1),
    anchorHarmKey: z.string().min(1),
    reworkKey: z.string().min(1),
  }),
});

export type ScenarioFact = z.infer<typeof factSchema>;
export type ScenarioTerm = z.infer<typeof termSchema>;
export type ScenarioPattern = z.infer<typeof patternSchema>;
export type CompetencyQuestion = z.infer<typeof competencyQuestionSchema>;
export type ScenarioEntity = z.infer<typeof entitySchema>;
export type Scenario = z.infer<typeof scenarioSchema>;

export type ScenarioValidation =
  | { ok: true; scenario: Scenario }
  | { ok: false; issues: readonly { path: string; message: string }[] };

/** Author-friendly validation: paths + human messages, never raw Zod output. */
export function validateScenario(input: unknown): ScenarioValidation {
  const result = scenarioSchema.safeParse(input);
  if (result.success) {
    return { ok: true, scenario: result.data };
  }
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.join('.') || '(root)',
      message: issue.message,
    })),
  };
}

export {
  gradeQuestion,
  intendedModel,
  lintScenario,
  type LintFinding,
  type LintReport,
} from './lint.js';
