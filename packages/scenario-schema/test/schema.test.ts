import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { lintScenario, validateScenario, type Scenario } from '../src/index.js';

/** The shipped proto case doubles as the schema's primary fixture. */
const gameScenarioPath = fileURLToPath(
  new URL('../../../apps/game/src/case/recall-at-freshmart.scenario.json', import.meta.url),
);
const gameScenario = (): unknown => JSON.parse(readFileSync(gameScenarioPath, 'utf8'));

const validated = (): Scenario => {
  const result = validateScenario(gameScenario());
  if (!result.ok) throw new Error(JSON.stringify(result.issues, null, 2));
  return result.scenario;
};

describe('scenario schema v1', () => {
  it('accepts the shipped FreshMart scenario', () => {
    expect(validateScenario(gameScenario()).ok).toBe(true);
  });

  it('rejects a scenario without a human anchor (§1.6 is structural)', () => {
    const { humanAnchor: _dropped, ...anchorless } = validated();
    const result = validateScenario(anchorless);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.path.startsWith('humanAnchor'))).toBe(true);
    }
  });

  it('rejects scannables with no scan facts (orphan evidence)', () => {
    const scenario = validated();
    const broken = {
      ...scenario,
      entities: [{ ...scenario.entities[0]!, scanFacts: [] }, ...scenario.entities.slice(1)],
    };
    expect(validateScenario(broken).ok).toBe(false);
  });

  it('reports author-friendly issues with paths', () => {
    const result = validateScenario({ schemaVersion: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
      for (const issue of result.issues) {
        expect(issue.path).toBeTruthy();
        expect(issue.message).toBeTruthy();
      }
    }
  });
});

describe('casewright semantic lint (#31)', () => {
  it('passes the shipped FreshMart scenario with zero findings', () => {
    const report = lintScenario(validated());
    expect(report.findings).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('fails when a competency question is not answerable from the intended model', () => {
    const scenario = validated();
    const broken: Scenario = {
      ...scenario,
      competencyQuestions: [
        {
          kind: 'ask',
          id: 'q.impossible',
          promptKey: scenario.competencyQuestions[0]!.promptKey,
          where: [
            {
              subject: { kind: 'const', value: 'product:berry-granola' },
              predicate: { kind: 'const', value: 'contains' },
              object: { kind: 'const', value: 'ing:hazelnut-paste' },
            },
          ],
          expectedTruth: 'true', // intended model says explicitly false
        },
      ],
    };
    const report = lintScenario(broken);
    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => f.rule === 'competency')).toBe(true);
  });

  it('fails when the Field Verification wave is missing', () => {
    const scenario = validated();
    const broken: Scenario = {
      ...scenario,
      entities: scenario.entities.filter((entity) => entity.wave !== 2),
      // Drop questions that depend on wave-2 facts so only the wave rule fires.
      competencyQuestions: [scenario.competencyQuestions[2]!],
    };
    const report = lintScenario(broken);
    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => f.rule === 'stress-wave')).toBe(true);
  });

  it('fails on missing localization keys', () => {
    const scenario = validated();
    const { 'case.title': _dropped, ...strings } = scenario.strings;
    const report = lintScenario({ ...scenario, strings });
    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => f.rule === 'string-keys')).toBe(true);
  });

  it('warns on unlabeled world ids (but errors on unlabeled candidates)', () => {
    const scenario = validated();
    // The store appears in facts but is not a candidate/class → warning only.
    const { 'store:freshmart-12': _dropped, ...labels } = scenario.labels;
    const report = lintScenario({ ...scenario, labels });
    expect(report.findings.some((f) => f.rule === 'labels' && f.severity === 'warning')).toBe(true);
    // Warnings alone don't block shipping.
    expect(report.ok).toBe(true);

    // A classification candidate without a label IS an error.
    const { 'ing:corn': _dropped2, ...labels2 } = scenario.labels;
    const report2 = lintScenario({ ...scenario, labels: labels2 });
    expect(report2.ok).toBe(false);
  });
});
