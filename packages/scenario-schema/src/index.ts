import { z } from 'zod';

/**
 * Scenario Schema — v0 skeleton on the way to v1 (backlog #30).
 *
 * v1 will add: ontology concepts, hidden facts, NPC knowledge, competency
 * batteries (Wave 1 + hidden Wave 2), Act verbs, hint ladder, stress-wave
 * triggers, completion conditions, elegance parameters (vision doc §19).
 * The shape below establishes the conventions those fields will follow:
 * ids are strings, all player-facing text is a localization key, and the
 * human anchor is REQUIRED — a case without a named harmed person does not
 * validate [I1-D5].
 */

export const truthValueSchema = z.enum(['true', 'false', 'unknown']);

export const humanAnchorSchema = z.object({
  npcId: z.string().min(1),
  nameKey: z.string().min(1),
  harmKey: z
    .string()
    .min(1)
    .describe('Localization key describing the concrete harm if the meaning failure persists.'),
});

export const entitySchema = z.object({
  id: z.string().min(1),
  labelKey: z.string().min(1),
});

export const factSchema = z.object({
  id: z.string().min(1),
  subject: z.string().min(1),
  predicate: z.string().min(1),
  object: z.union([z.string(), z.number(), z.boolean()]),
  truth: truthValueSchema,
  hidden: z.boolean().default(false),
});

export const evidenceSchema = z.object({
  id: z.string().min(1),
  labelKey: z.string().min(1),
  supportsFactIds: z.array(z.string().min(1)).min(1, 'No orphan evidence (§19).'),
});

export const scenarioSchema = z.object({
  schemaVersion: z.literal(0),
  id: z.string().min(1),
  titleKey: z.string().min(1),
  humanAnchor: humanAnchorSchema,
  entities: z.array(entitySchema),
  facts: z.array(factSchema),
  evidence: z.array(evidenceSchema),
});

export type HumanAnchor = z.infer<typeof humanAnchorSchema>;
export type ScenarioEntity = z.infer<typeof entitySchema>;
export type ScenarioFact = z.infer<typeof factSchema>;
export type ScenarioEvidence = z.infer<typeof evidenceSchema>;
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
