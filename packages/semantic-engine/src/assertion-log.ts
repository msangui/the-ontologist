import type { Assertion, AssertionId, LogEvent } from './types.js';

/**
 * Append-only, event-sourced assertion log (backlog #19).
 *
 * Invariants:
 * - `seq` is dense and monotonically increasing; state = fold(events).
 * - No API mutates state outside the log; retract appends, it never deletes.
 * - Replaying the same events always yields identical state (determinism is
 *   a property here, verified by the golden corpus in CI later, #28).
 */
export class AssertionLog {
  private readonly events: LogEvent[] = [];
  private readonly active = new Map<AssertionId, Assertion>();

  /** Append an assert event. Re-asserting an active id is rejected — retract first. */
  assert(assertion: Assertion): LogEvent {
    if (this.active.has(assertion.id)) {
      throw new Error(`Assertion "${assertion.id}" is already active; retract it first.`);
    }
    const event: LogEvent = { seq: this.events.length, kind: 'assert', assertion };
    this.events.push(event);
    this.active.set(assertion.id, assertion);
    return event;
  }

  /** Append a retract event for an active assertion. */
  retract(assertionId: AssertionId): LogEvent {
    if (!this.active.has(assertionId)) {
      throw new Error(`Cannot retract "${assertionId}": not an active assertion.`);
    }
    const event: LogEvent = { seq: this.events.length, kind: 'retract', assertionId };
    this.events.push(event);
    this.active.delete(assertionId);
    return event;
  }

  /** Currently active assertions, in insertion order (deterministic). */
  activeAssertions(): readonly Assertion[] {
    return [...this.active.values()];
  }

  get(assertionId: AssertionId): Assertion | undefined {
    return this.active.get(assertionId);
  }

  /** Full event history (the save format and the replay input). */
  history(): readonly LogEvent[] {
    return [...this.events];
  }

  get length(): number {
    return this.events.length;
  }

  /** Serialize the full history. The log IS the model save (§18.7). */
  serialize(): string {
    return JSON.stringify(this.events);
  }

  /** Rebuild a log by folding serialized events. Validates sequence density. */
  static deserialize(serialized: string): AssertionLog {
    const events = JSON.parse(serialized) as LogEvent[];
    return AssertionLog.replay(events);
  }

  /** Fold events into a fresh log, re-checking every invariant along the way. */
  static replay(events: readonly LogEvent[]): AssertionLog {
    const log = new AssertionLog();
    for (const [index, event] of events.entries()) {
      if (event.seq !== index) {
        throw new Error(`Corrupt log: event at position ${index} has seq ${event.seq}.`);
      }
      if (event.kind === 'assert') {
        log.assert(event.assertion);
      } else {
        log.retract(event.assertionId);
      }
    }
    return log;
  }
}
