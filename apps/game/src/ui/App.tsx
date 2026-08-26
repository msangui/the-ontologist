import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { LABELS, PRODUCT_IDS } from '../case/protoCase';
import {
  CaseSession,
  type FactView,
  type ProductStatus,
  type RecallDecision,
} from '../case/session';
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

/**
 * The Commit beat (#53 embryo): file the recall report. Every Act shows its
 * Consequence Preview before committing [I4-D1]; the uncertain product is a
 * forced choice — hold (unknown stays unknown) or clear (unknown treated as
 * false), the designed harm beat [I5-D3].
 */
function CommitPanel() {
  const productStatus = useGameStore((s) => s.productStatus);
  const closeCommit = useGameStore((s) => s.closeCommit);
  const fileReport = useGameStore((s) => s.fileReport);
  const [choices, setChoices] = useState<Record<string, 'hold' | 'clear'>>({});

  const decisionFor = (id: string): RecallDecision | null => {
    const status = productStatus[id] ?? 'pending';
    if (status === 'affected') return 'pull';
    if (status === 'safe') return 'leave';
    return choices[id] ?? null;
  };
  const allDecided = PRODUCT_IDS.every((id) => decisionFor(id) !== null);

  return (
    <div
      data-testid="commit-panel"
      style={{
        ...panel,
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 460,
        padding: '14px 16px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <strong>File the recall report</strong>
        <button
          type="button"
          onClick={closeCommit}
          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14 }}
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div style={{ color: '#7a7062', margin: '4px 0 10px' }}>
        The report goes to Field Verification: the lab tests everything you flag. This preview is
        what the model predicts — commit when you stand behind it.
      </div>
      <ul style={{ margin: 0, padding: 0 }}>
        {PRODUCT_IDS.map((id) => {
          const status = productStatus[id] ?? 'pending';
          const badge = STATUS_BADGE[status];
          const decision = decisionFor(id);
          return (
            <li key={id} style={{ listStyle: 'none', marginBottom: 10 }}>
              <span style={{ color: badge.color, marginRight: 6 }} aria-hidden>
                {badge.glyph}
              </span>
              <strong>{LABELS[id]}</strong>{' '}
              <span style={{ color: badge.color }}>({badge.word})</span>
              <div style={{ marginLeft: 20, marginTop: 2 }}>
                {status === 'uncertain' ? (
                  <span data-testid={`decision-${id}`}>
                    <label style={{ marginRight: 12, cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name={`decision-${id}`}
                        data-testid={`decision-${id}-hold`}
                        checked={choices[id] === 'hold'}
                        onChange={() => setChoices((c) => ({ ...c, [id]: 'hold' }))}
                      />{' '}
                      Hold for testing
                    </label>
                    <label style={{ cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name={`decision-${id}`}
                        data-testid={`decision-${id}-clear`}
                        checked={choices[id] === 'clear'}
                        onChange={() => setChoices((c) => ({ ...c, [id]: 'clear' }))}
                      />{' '}
                      Clear for sale
                    </label>
                  </span>
                ) : (
                  <em>{decision === 'pull' ? 'Pull from sale' : 'Leave as is'}</em>
                )}
                <div style={{ color: '#7a7062', fontSize: 12, marginTop: 2 }}>
                  → {decision ? CaseSession.previewOf(decision, status) : 'choose an action'}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        data-testid="file-report"
        disabled={!allDecided}
        onClick={() => {
          const decisions: Record<string, RecallDecision> = {};
          for (const id of PRODUCT_IDS) decisions[id] = decisionFor(id)!;
          fileReport(decisions);
        }}
        style={{
          marginTop: 6,
          padding: '6px 16px',
          borderRadius: 8,
          border: '1px solid #2b5a78',
          background: '#2b5a78',
          color: '#fff',
          cursor: allDecided ? 'pointer' : 'not-allowed',
          opacity: allDecided ? 1 : 0.5,
        }}
      >
        Commit — send to Field Verification
      </button>
    </div>
  );
}

/** The Debrief (#60 embryo): the in-fiction report card. */
function DebriefPanel() {
  const debrief = useGameStore((s) => s.debrief);
  if (!debrief) return null;
  return (
    <div
      data-testid="debrief-panel"
      style={{
        ...panel,
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 480,
        maxHeight: '70vh',
        overflowY: 'auto',
        padding: '14px 16px',
      }}
    >
      <strong>Case Debrief — The Recall at FreshMart</strong>
      <ul style={{ margin: '10px 0 0', padding: 0 }}>
        {debrief.rows.map((row) => (
          <li
            key={row.entityId}
            data-testid={`debrief-${row.entityId}`}
            style={{ listStyle: 'none', marginBottom: 8 }}
          >
            <span
              style={{ color: row.verdict === 'harm' ? '#8c2f26' : '#2f6b3f', marginRight: 6 }}
              aria-hidden
            >
              {row.verdict === 'harm' ? '⚠' : '✓'}
            </span>
            <strong>{row.label}</strong> — {row.fieldResult}.
            <div style={{ marginLeft: 20, color: '#5a4c3a', fontSize: 12 }}>{row.note}</div>
          </li>
        ))}
      </ul>
      <div
        data-testid="debrief-anchor"
        style={{
          marginTop: 10,
          padding: '8px 10px',
          borderLeft: `3px solid ${debrief.harm ? '#8c2f26' : '#2f6b3f'}`,
          background: 'rgba(90,70,50,0.06)',
        }}
      >
        {debrief.anchorOutcome}
      </div>
      <div style={{ marginTop: 8, color: '#7a7062', fontSize: 12 }}>{debrief.reworkNote}</div>
    </div>
  );
}

/** Save controls (#62/#63): reset, export to file, import from file. */
function SaveControls() {
  const resetCase = useGameStore((s) => s.resetCase);
  const exportSave = useGameStore((s) => s.exportSave);
  const importSave = useGameStore((s) => s.importSave);
  const importError = useGameStore((s) => s.importError);
  const fileInput = useRef<HTMLInputElement>(null);

  const linkStyle: CSSProperties = {
    border: 'none',
    background: 'none',
    padding: 0,
    color: '#2b5a78',
    cursor: 'pointer',
    fontSize: 12,
    textDecoration: 'underline',
  };

  const download = () => {
    const blob = new Blob([exportSave()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'the-ontologist-save.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ marginTop: 8, fontSize: 12 }}>
      <button type="button" data-testid="reset-case" onClick={resetCase} style={linkStyle}>
        New case
      </button>
      {' · '}
      <button type="button" data-testid="export-save" onClick={download} style={linkStyle}>
        Export save
      </button>
      {' · '}
      <button
        type="button"
        data-testid="import-save"
        onClick={() => fileInput.current?.click()}
        style={linkStyle}
      >
        Import save
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        data-testid="import-save-input"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) importSave(await file.text());
          e.target.value = '';
        }}
      />
      {importError && (
        <div data-testid="import-error" style={{ color: '#8c2f26', marginTop: 4 }}>
          {importError}
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

  const objective =
    state.phase === 'debrief'
      ? 'Case closed — read the Debrief.'
      : state.phase === 'verification'
        ? 'Field Verification: the lab results just arrived — find the courier drop near the desk.'
        : state.readyToCommit
          ? 'Every product is accounted for — file the recall report (top right).'
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
        <SaveControls />
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
        {state.readyToCommit && (
          <button
            type="button"
            data-testid="file-report-open"
            onClick={state.openCommit}
            style={{
              marginTop: 8,
              padding: '6px 14px',
              borderRadius: 8,
              border: '1px solid #2b5a78',
              background: '#2b5a78',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            File recall report…
          </button>
        )}
        {state.phase === 'debrief' && (
          <div data-testid="case-complete" style={{ marginTop: 8, color: '#2f6b3f' }}>
            ✓ Case closed after Field Verification.
          </div>
        )}
      </div>

      {/* Commit + Debrief beats. */}
      {state.commitOpen && <CommitPanel />}
      {state.phase === 'debrief' && <DebriefPanel />}

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
