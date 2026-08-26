import { describe, expect, it } from 'vitest';
import {
  AssertionLog,
  VOCAB,
  ask,
  c,
  infer,
  select,
  v,
  type Assertion,
  type TruthValue,
} from '../src/index.js';

let seq = 0;
const a = (
  subject: string,
  predicate: string,
  object: string | number | boolean,
  truth: TruthValue = 'true',
): Assertion => ({
  id: `a${(seq += 1)}`,
  subject,
  predicate,
  object,
  truth,
  provenance: { kind: 'evidence', evidenceId: `ev:${seq}` },
});

const logOf = (...assertions: Assertion[]): AssertionLog => {
  const log = new AssertionLog();
  for (const assertion of assertions) log.assert(assertion);
  return log;
};

/** The recall shape: two products, one via a transitive chain, one unknown. */
const recallResult = () =>
  infer(
    logOf(
      a('contains', VOCAB.transitiveProperty, true),
      a('ing:paste', VOCAB.instanceOf, 'class:recalled'),
      a('product:bites', 'contains', 'mix:base'),
      a('mix:base', 'contains', 'ing:paste'),
      a('product:crunch', 'contains', 'ing:paste', 'unknown'),
      a('product:granola', 'contains', 'ing:oats'),
      a('product:pops', 'contains', 'ing:paste', 'false'),
    ),
  );

describe('select', () => {
  it('joins patterns across variables, including inferred facts', () => {
    const answers = select(recallResult(), {
      select: ['p'],
      where: [
        { subject: v('p'), predicate: c('contains'), object: v('i') },
        { subject: v('i'), predicate: c(VOCAB.instanceOf), object: c('class:recalled') },
      ],
    });
    const byProduct = new Map(answers.map((ans) => [ans.binding['p'], ans.truth]));
    // bites matches only via the DERIVED transitive fact.
    expect(byProduct.get('product:bites')).toBe('true');
    expect(byProduct.get('product:crunch')).toBe('unknown');
    expect(byProduct.has('product:granola')).toBe(false);
  });

  it('never lets explicitly false facts support an answer', () => {
    const answers = select(recallResult(), {
      select: ['p'],
      where: [{ subject: v('p'), predicate: c('contains'), object: c('ing:paste') }],
    });
    expect(answers.map((ans) => ans.binding['p'])).not.toContain('product:pops');
  });

  it('marks answers unknown when any support is unknown, and true wins ties', () => {
    const result = infer(
      logOf(
        a('x', 'rel', 'y', 'unknown'),
        a('x', 'rel', 'y'), // also explicitly true — true must win
        a('z', 'rel', 'y', 'unknown'),
      ),
    );
    const answers = select(result, {
      select: ['s'],
      where: [{ subject: v('s'), predicate: c('rel'), object: c('y') }],
    });
    const truths = new Map(answers.map((ans) => [ans.binding['s'], ans.truth]));
    expect(truths.get('x')).toBe('true');
    expect(truths.get('z')).toBe('unknown');
  });

  it('exposes supports so unknown answers name their missing evidence', () => {
    const answers = select(recallResult(), {
      select: ['p'],
      where: [
        { subject: v('p'), predicate: c('contains'), object: v('i') },
        { subject: v('i'), predicate: c(VOCAB.instanceOf), object: c('class:recalled') },
      ],
    });
    const crunch = answers.find((ans) => ans.binding['p'] === 'product:crunch');
    expect(crunch?.supports.some((f) => f.truth === 'unknown')).toBe(true);
  });

  it('is deterministic: same answers in the same order across runs', () => {
    const run = () =>
      JSON.stringify(
        select(recallResult(), {
          select: ['p', 'i'],
          where: [{ subject: v('p'), predicate: c('contains'), object: v('i') }],
        }).map((ans) => ({ b: ans.binding, t: ans.truth })),
      );
    expect(run()).toBe(run());
  });
});

describe('ask (tri-state yes/no)', () => {
  const result = recallResult();

  it('answers true for a supported ground claim (via inference)', () => {
    expect(
      ask(result, {
        select: [],
        where: [{ subject: c('product:bites'), predicate: c('contains'), object: c('ing:paste') }],
      }),
    ).toBe('true');
  });

  it('answers false only for explicitly contradicted ground claims', () => {
    expect(
      ask(result, {
        select: [],
        where: [{ subject: c('product:pops'), predicate: c('contains'), object: c('ing:paste') }],
      }),
    ).toBe('false');
  });

  it('answers unknown for absent evidence — open world, not false', () => {
    expect(
      ask(result, {
        select: [],
        where: [
          { subject: c('product:granola'), predicate: c('contains'), object: c('ing:paste') },
        ],
      }),
    ).toBe('unknown');
  });

  it('answers unknown when support exists but is unknown', () => {
    expect(
      ask(result, {
        select: [],
        where: [{ subject: c('product:crunch'), predicate: c('contains'), object: c('ing:paste') }],
      }),
    ).toBe('unknown');
  });
});
