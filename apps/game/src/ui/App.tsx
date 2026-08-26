import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { LABELS, PRODUCT_IDS } from '../case/protoCase';
import type { FactView, ProductStatus } from '../case/session';
import { useGameStore } from '../state/store';

/**
 * Proto overlay: HUD + Lens card + Journal + case status (embryos of #47/#48/#52).
 * React owns this DOM layer; everything it knows arrives through the store.
 */

const panel: CSSProperties = {
  pointerEvents: 'auto',
  background: 'rgba(255, 252, 245, 0.94)',
  border: '1px solid rgba(90, 70, 50, 0.25)',
  borderRadius: 10,
  boxShadow: '0 2px 10px rgba(60, 40, 20, 0.12)',
  color: '#3b2f22',
  fontSize: 13,
};

/** Dual encoding (§10.4): every truth/status has a glyph + word, never color alone. */
const TRUTH_BADGE: Record<string, { glyph: string; word: string; color: string }> = {
  true: { glyph: '●', word: '', color: '#2b5a78' },
  false: { glyph: '⨯', word: 'not', color: '#8c2f26' },
  unknown: { glyph: '?', word: 'unknown', color: '#8a6d1f' },
};

const STATUS_BADGE: Record<ProductStatus, { glyph: string; word: string; color: string }> = {
  pending: { glyph: '…', word: 'undetermined', color: '#7a7062' },
  affected: { glyph: '⚠', word: 'AFFECTED', color: '#8c2f26' },
  uncertain: { glyph: '?', word: 'UNCERTAIN', color: '#8a6d1f' },
  safe: { glyph: '✓', word: 'safe', color: '#2f6b3f' },
};

function FactRow({ fact }: { fact: FactView }) {
  const [showWhy, setShowWhy] = useState(false);
  const badge = TRUTH_BADGE[fact.truth]!;
  return (
    <li style={{ marginBottom: 6, listStyle: 'none' }}>
      <span style={{ color: badge.color, marginRight: 6 }} aria-hidden>
        {badge.glyph}
      </span>
      <span data-testid="fact-text">
        {fact.text}
        {fact.truth !== 'true' && <em style={{ color: badge.color }}> — {badge.word}</em>}
      </span>
      {fact.inferred ? (
        <button
          type="button"
          onClick={() => setShowWhy((v) => !v)}
          data-testid="why-button"
          style={{
            marginLeft: 8,
            fontSize: 11,
            padding: '1px 7px',
            borderRadius: 8,
            border: '1px solid #2b5a78',
            background: showWhy ? '#2b5a78' : 'transparent',
            color: showWhy ? '#fff' : '#2b5a78',
            cursor: 'pointer',
          }}
        >
          inferred — why?
        </button>
      ) : (
        fact.source && <span style={{ color: '#7a7062' }}> · from {fact.source}</span>
      )}
      {showWhy && fact.explanation && (
        <ul
          data-testid="why-trace"
          style={{ margin: '4px 0 0 18px', padding: 0, color: '#5a4c3a' }}
        >
          {fact.explanation.map((line) => (
            <li key={line} style={{ listStyle: 'disc' }}>
              {line}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * The Test verb (#51 embryo): sentence-based query builder — mad-libs slots,
 * never free text. Slot options come from what the model already knows.
 */
function AskPanel() {
  const containsSlotOptions = useGameStore((s) => s.containsSlotOptions);
  const queryResults = useGameStore((s) => s.queryResults);
  const querySentence = useGameStore((s) => s.querySentence);
  const runContainsQuery = useGameStore((s) => s.runContainsQuery);
  const runSoldHereQuery = useGameStore((s) => s.runSoldHereQuery);
  const toggleQuery = useGameStore((s) => s.toggleQuery);
  const [template, setTemplate] = useState<'contains' | 'soldHere'>('contains');
  const [slot, setSlot] = useState('');

  const canRun = template === 'soldHere' || (slot !== '' && containsSlotOptions.length > 0);

  return (
    <div
      data-testid="query-panel"
      style={{
        ...panel,
        position: 'absolute',
        top: 170,
        right: 16,
        width: 340,
        maxHeight: '60vh',
        overflowY: 'auto',
        padding: '12px 14px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <strong>Ask the model</strong>
        <button
          type="button"
          onClick={toggleQuery}
          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14 }}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div style={{ marginTop: 8, lineHeight: 2 }}>
        Which products{' '}
        <select
          data-testid="query-template"
          value={template}
          onChange={(e) => setTemplate(e.target.value as 'contains' | 'soldHere')}
          style={{ fontSize: 13 }}
        >
          <option value="contains">contain</option>
          <option value="soldHere">are sold at</option>
        </select>{' '}
        {template === 'contains' ? (
          <select
            data-testid="query-slot"
            value={slot}
            onChange={(e) => setSlot(e.target.value)}
            style={{ fontSize: 13 }}
          >
            <option value="" disabled>
              {containsSlotOptions.length ? 'pick an ingredient…' : 'scan evidence first…'}
            </option>
            {containsSlotOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <strong>FreshMart #12</strong>
        )}
        ?{' '}
        <button
          type="button"
          data-testid="query-run"
          disabled={!canRun}
          onClick={() => (template === 'contains' ? runContainsQuery(slot) : runSoldHereQuery())}
          style={{
            marginLeft: 6,
            padding: '3px 12px',
            borderRadius: 8,
            border: '1px solid #2b5a78',
            background: '#2b5a78',
            color: '#fff',
            cursor: canRun ? 'pointer' : 'not-allowed',
            opacity: canRun ? 1 : 0.5,
          }}
        >
          Ask
        </button>
      </div>

      {queryResults && (
        <div data-testid="query-results" style={{ marginTop: 10 }}>
          <div style={{ color: '#7a7062', marginBottom: 6 }}>
            <em>{querySentence}</em>
          </div>
          {queryResults.length === 0 ? (
            <div>
              No products match — <em>so far</em>. Absence of evidence isn’t evidence of absence.
            </div>
          ) : (
            <ul style={{ margin: 0, padding: 0 }}>
              {queryResults.map((row) => {
                const badge = TRUTH_BADGE[row.truth]!;
                return (
                  <li
                    key={row.entityId}
                    data-testid={`answer-${row.entityId}`}
                    style={{ listStyle: 'none', marginBottom: 6 }}
                  >
                    <span style={{ color: badge.color, marginRight: 6 }} aria-hidden>
                      {badge.glyph}
                    </span>
                    {row.label}
                    {row.truth === 'unknown' && (
                      <em style={{ color: badge.color }}> — can’t tell yet</em>
                    )}
                    <details style={{ marginLeft: 18, color: '#5a4c3a' }}>
                      <summary style={{ cursor: 'pointer', fontSize: 12 }}>
                        {row.truth === 'unknown' ? 'what would settle it?' : 'why?'}
                      </summary>
                      <ul style={{ margin: '4px 0 0 14px', padding: 0 }}>
                        {row.supports.map((line) => (
                          <li key={line} style={{ listStyle: 'disc' }}>
                            {line}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function App() {
  const state = useGameStore();

  // Keyboard verbs: E scans what's in reach, J toggles the Journal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'e') {
        const { nearbyId, scan } = useGameStore.getState();
        if (nearbyId) scan(nearbyId);
      }
      if (key === 'j') useGameStore.getState().toggleJournal();
      if (key === 'q') useGameStore.getState().toggleQuery();
      if (key === 'escape') useGameStore.getState().closeLens();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const objective = state.caseComplete
    ? 'Case status determined. Field Verification would come next — nice work.'
    : state.scannedIds.includes('doc:recall-notice')
      ? 'Work out which shelf products are affected by the recall.'
      : 'A recall notice arrived — find it in the backroom (west desk).';

  return (
    <>
      {/* HUD (§14.3): objective, counters, threads. */}
      <div
        data-testid="hud"
        style={{
          ...panel,
          position: 'absolute',
          top: 16,
          left: 16,
          padding: '10px 14px',
          maxWidth: 340,
        }}
      >
        <strong>The Last Ontologist</strong> · proto case
        <div data-testid="objective" style={{ marginTop: 6 }}>
          {objective}
        </div>
        <div style={{ marginTop: 6, color: '#7a7062' }}>
          Evidence {state.scannedCount}/{state.scannableCount} ·{' '}
          <span
            data-testid="thread-count"
            style={{ color: state.contradictionCount ? '#8c2f26' : undefined }}
          >
            {state.contradictionCount} red thread{state.contradictionCount === 1 ? '' : 's'}
          </span>
        </div>
        <div style={{ marginTop: 6, color: '#7a7062', fontSize: 12 }}>
          WASD/arrows move · E scan · J journal · Q ask · click a nearby item to scan
        </div>
      </div>

      {/* Case status panel — the case question, answered live by the engine. */}
      <div
        data-testid="status-panel"
        style={{
          ...panel,
          position: 'absolute',
          top: 16,
          right: 16,
          padding: '10px 14px',
          minWidth: 230,
        }}
      >
        <strong>Recall status</strong>
        <ul style={{ margin: '8px 0 0', padding: 0 }}>
          {PRODUCT_IDS.map((id) => {
            const status = state.productStatus[id] ?? 'pending';
            const badge = STATUS_BADGE[status];
            return (
              <li
                key={id}
                data-testid={`status-${id}`}
                style={{ listStyle: 'none', marginBottom: 4 }}
              >
                <span style={{ color: badge.color, marginRight: 6 }} aria-hidden>
                  {badge.glyph}
                </span>
                {LABELS[id]} — <span style={{ color: badge.color }}>{badge.word}</span>
              </li>
            );
          })}
        </ul>
        {state.caseComplete && (
          <div data-testid="case-complete" style={{ marginTop: 8, color: '#2f6b3f' }}>
            ✓ All products accounted for — and “unknown” was not treated as “safe”.
          </div>
        )}
      </div>

      {/* Lens card (§14.4 embryo). */}
      {state.lensCard && (
        <div
          data-testid="lens-card"
          style={{
            ...panel,
            position: 'absolute',
            right: 16,
            bottom: 16,
            width: 330,
            padding: '12px 14px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>{state.lensCard.label}</strong>
            <button
              type="button"
              onClick={state.closeLens}
              data-testid="lens-close"
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14 }}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div style={{ color: '#7a7062', margin: '4px 0 8px' }}>{state.lensCard.blurb}</div>
          {state.lensCard.alreadyScanned ? (
            <em>Already captured in the Journal.</em>
          ) : (
            <>
              {state.lensCard.learned.length > 0 && (
                <>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Recorded</div>
                  <ul style={{ margin: 0, padding: 0 }}>
                    {state.lensCard.learned.map((f) => (
                      <FactRow key={f.id} fact={f} />
                    ))}
                  </ul>
                </>
              )}
              {state.lensCard.inferred.length > 0 && (
                <>
                  <div style={{ fontWeight: 600, margin: '6px 0 4px', color: '#2b5a78' }}>
                    New conclusions
                  </div>
                  <ul style={{ margin: 0, padding: 0 }}>
                    {state.lensCard.inferred.map((f) => (
                      <FactRow key={f.id} fact={f} />
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Journal (#48 embryo). */}
      {state.journalOpen && (
        <div
          data-testid="journal"
          style={{
            ...panel,
            position: 'absolute',
            left: 16,
            bottom: 16,
            width: 400,
            maxHeight: '55vh',
            overflowY: 'auto',
            padding: '12px 14px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>Evidence Journal</strong>
            <button
              type="button"
              onClick={state.toggleJournal}
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14 }}
              aria-label="Close journal"
            >
              ✕
            </button>
          </div>
          {state.journal.length === 0 ? (
            <em>Nothing recorded yet — scan something with the Lens (E).</em>
          ) : (
            <ul style={{ margin: '8px 0 0', padding: 0 }}>
              {state.journal.map((f) => (
                <FactRow key={f.id} fact={f} />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Ask panel (the Test verb). */}
      {state.queryOpen && <AskPanel />}

      {/* Contextual prompt. */}
      {state.nearbyId && !state.lensCard && (
        <div
          data-testid="scan-prompt"
          style={{
            ...panel,
            position: 'absolute',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '8px 16px',
          }}
        >
          Press <strong>E</strong> — scan {state.nearbyLabel}
        </div>
      )}

      {/* Journal toggle for pointer-first players. */}
      <button
        type="button"
        data-testid="journal-toggle"
        onClick={state.toggleJournal}
        style={{
          ...panel,
          position: 'absolute',
          left: 16,
          bottom: state.journalOpen ? -9999 : 16,
          padding: '8px 14px',
          cursor: 'pointer',
        }}
      >
        📓 Journal ({state.journal.length})
      </button>

      {/* Ask toggle for pointer-first players. */}
      <button
        type="button"
        data-testid="query-toggle"
        onClick={state.toggleQuery}
        style={{
          ...panel,
          position: 'absolute',
          left: 170,
          bottom: 16,
          padding: '8px 14px',
          cursor: 'pointer',
        }}
      >
        🔍 Ask
      </button>
    </>
  );
}
