import { describe, expect, it } from 'vitest';
import { validateScenario } from '../src/index.js';

const validScenario = {
  schemaVersion: 0,
  id: 'slice.recall-at-freshmart',
  titleKey: 'scenario.freshmart.title',
  humanAnchor: {
    npcId: 'npc:maya',
    nameKey: 'npc.maya.name',
    harmKey: 'scenario.freshmart.anchor.harm',
  },
  entities: [{ id: 'product:oat-bites-6pack', labelKey: 'entity.oat-bites-6pack.label' }],
  facts: [
    {
      id: 'f1',
      subject: 'product:oat-bites-6pack',
      predicate: 'contains',
      object: 'ingredient:cocoa-powder',
      truth: 'true',
      hidden: false,
    },
  ],
  evidence: [
    {
      id: 'ev:label-scan-01',
      labelKey: 'evidence.label-scan-01.label',
      supportsFactIds: ['f1'],
    },
  ],
};

describe('scenario schema v0', () => {
  it('accepts a well-formed scenario', () => {
    const result = validateScenario(validScenario);
    expect(result.ok).toBe(true);
  });

  it('rejects a scenario without a human anchor (§1.6 is structural)', () => {
    const { humanAnchor: _dropped, ...anchorless } = validScenario;
    const result = validateScenario(anchorless);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.path.startsWith('humanAnchor'))).toBe(true);
    }
  });

  it('rejects orphan evidence', () => {
    const orphan = {
      ...validScenario,
      evidence: [{ id: 'ev:x', labelKey: 'evidence.x.label', supportsFactIds: [] }],
    };
    const result = validateScenario(orphan);
    expect(result.ok).toBe(false);
  });

  it('reports author-friendly issues with paths', () => {
    const result = validateScenario({ schemaVersion: 0 });
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
