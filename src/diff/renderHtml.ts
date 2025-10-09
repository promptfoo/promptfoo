import { RunDiff } from './types';
export function renderHtml(diff: RunDiff): string {
  return `<!doctype html><meta charset="utf-8"><title>Baseline Diff</title>
  <h1>Baseline Diff</h1>
  <p>Compared ${diff.summary.totalCompared} rows; changed ${diff.summary.changedCount}</p>`;
}
