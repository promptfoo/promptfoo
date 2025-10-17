import type { RunDiff } from '../../../../../diff/types';

export default function CompareView({
  diff,
  baselineId,
  currentEvalId,
  onClearBaseline,
}: {
  diff: RunDiff;
  baselineId: string;
  currentEvalId: string;
  onClearBaseline?: () => void;
}) {
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontWeight: 600 }}>
          Compared {diff.summary.totalCompared}; changed {diff.summary.changedCount}
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <span>
            Baseline: <code>{baselineId}</code>
          </span>
          <span>
            Candidate: <code>{currentEvalId}</code>
          </span>
          {onClearBaseline && (
            <button onClick={onClearBaseline} style={{ marginLeft: 8 }}>
              Clear baseline
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontWeight: 600 }}>
        <div>Baseline Output</div>
        <div>Candidate Output</div>
      </div>

      <div style={{ marginTop: 8 }}>
        {diff.rows.map((r) => (
          <div key={r.id} style={{ borderTop: '1px solid #eee', padding: '12px 0' }}>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>{r.id}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{r.before?.output ?? ''}</pre>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{r.after?.output ?? ''}</pre>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
