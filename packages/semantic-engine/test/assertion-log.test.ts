import { describe, expect, it } from 'vitest';
import { AssertionLog, type Assertion } from '../src/index.js';

const fact = (id: string, overrides: Partial<Assertion> = {}): Assertion => ({
  id,
  subject: 'product:oat-bites-6pack',
  predicate: 'contains',
  object: 'ingredient:cocoa-powder',
  truth: 'true',
  provenance: { kind: 'evidence', evidenceId: 'ev:label-scan-01' },
  ...overrides,
});

describe('AssertionLog', () => {
  it('appends assertions and exposes them as active state', () => {
    const log = new AssertionLog();
    log.assert(fact('a1'));
    log.assert(fact('a2', { truth: 'unknown' }));

    expect(log.activeAssertions().map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(log.get('a2')?.truth).toBe('unknown');
  });

  it('treats retraction as an event, never a mutation of history', () => {
    const log = new AssertionLog();
    log.assert(fact('a1'));
    log.retract('a1');

    expect(log.activeAssertions()).toEqual([]);
    expect(log.history()).toHaveLength(2);
    expect(log.history()[1]).toMatchObject({ kind: 'retract', assertionId: 'a1' });
  });

  it('rejects double-assert and retract-of-inactive', () => {
    const log = new AssertionLog();
    log.assert(fact('a1'));
    expect(() => log.assert(fact('a1'))).toThrow(/already active/);
    expect(() => log.retract('nope')).toThrow(/not an active assertion/);
  });

  it('keeps unknown distinct from false (tri-state is structural)', () => {
    const log = new AssertionLog();
    log.assert(fact('a1', { truth: 'unknown' }));
    log.assert(fact('a2', { id: 'a2', truth: 'false' }));

    expect(log.get('a1')?.truth).toBe('unknown');
    expect(log.get('a2')?.truth).toBe('false');
    expect(log.get('a1')?.truth).not.toBe(log.get('a2')?.truth);
  });

  it('replays to identical state (determinism property)', () => {
    const log = new AssertionLog();
    log.assert(fact('a1'));
    log.assert(fact('a2', { truth: 'false' }));
    log.retract('a1');
    log.assert(fact('a3', { truth: 'unknown' }));

    const replayed = AssertionLog.replay(log.history());
    expect(replayed.serialize()).toBe(log.serialize());
    expect(replayed.activeAssertions()).toEqual(log.activeAssertions());
  });

  it('round-trips through serialize/deserialize (the save format)', () => {
    const log = new AssertionLog();
    log.assert(fact('a1'));
    log.retract('a1');
    log.assert(fact('a2', { validity: { from: '2031-01-01', to: '2031-06-30' } }));

    const restored = AssertionLog.deserialize(log.serialize());
    expect(restored.serialize()).toBe(log.serialize());
    expect(restored.get('a2')?.validity).toEqual({ from: '2031-01-01', to: '2031-06-30' });
  });

  it('rejects corrupt logs with broken sequence numbers', () => {
    const log = new AssertionLog();
    log.assert(fact('a1'));
    const events = [...log.history()];
    const first = events[0]!;
    const corrupted = [{ ...first, seq: 5 }];
    expect(() => AssertionLog.replay(corrupted)).toThrow(/Corrupt log/);
  });
});
