import { EvalRun, RunDiff } from './types';

export function computeDiff(
  from: EvalRun,
  to: EvalRun,
  _opts?: { onlyChanged?: boolean },
): RunDiff {
  const toMap = new Map(to.rows.map((r) => [r.id, r]));
  const rows = from.rows.map((before) => {
    const after = toMap.get(before.id);
    const changed = !!after && before.output !== after.output;
    return { id: before.id, before, after, changed };
  });
  const changedCount = rows.filter((r: any) => r.changed).length;
  return {
    from,
    to,
    rows: rows as any,
    summary: {
      totalCompared: rows.length,
      changedCount,
      improvedCount: 0,
      regressedCount: 0,
      unchangedCount: rows.length - changedCount,
      passFlips: { toPass: 0, toFail: 0 },
    },
  };
}
