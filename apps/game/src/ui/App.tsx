import { useGameStore } from '../state/store';
import { DEMO_CRATE_ID } from '../scene/createScene';

/**
 * Walking-skeleton overlay (backlog #16). React owns this DOM; it talks to the
 * scene exclusively through the Zustand store.
 */
export function App() {
  const selectedEntityId = useGameStore((s) => s.selectedEntityId);
  const pulseCount = useGameStore((s) => s.pulseCount);
  const pulse = useGameStore((s) => s.pulse);

  return (
    <div
      data-testid="overlay-panel"
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        pointerEvents: 'auto',
        background: 'rgba(255, 252, 245, 0.92)',
        border: '1px solid rgba(90, 70, 50, 0.25)',
        borderRadius: 10,
        padding: '12px 16px',
        maxWidth: 300,
        boxShadow: '0 2px 10px rgba(60, 40, 20, 0.12)',
      }}
    >
      <strong>The Last Ontologist</strong>
      <div style={{ fontSize: 13, marginTop: 6 }} data-testid="selection-readout">
        {selectedEntityId === DEMO_CRATE_ID
          ? 'Selected: demo crate (click elsewhere to deselect)'
          : 'Click the crate to select it.'}
      </div>
      <button
        type="button"
        data-testid="pulse-button"
        onClick={pulse}
        style={{ marginTop: 10, padding: '6px 12px', cursor: 'pointer' }}
      >
        Ping the crate ({pulseCount})
      </button>
    </div>
  );
}
