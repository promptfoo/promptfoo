// src/pages/eval/diff/lib/types.ts

// Defines the shape of each test item in a run
export type RunItem = {
  key: string;           // stable, deterministic key used to match baseline/current rows
  name?: string;         // optional human-friendly name for UI
  tags?: string[];       // optional tags (e.g., ["faq", "refund"])
  output: string;        // final text output (stringify JSON upstream if needed)
  pass?: boolean;        // overall pass/fail (if you have assertions)
  score?: number | null; // optional numeric metric (aggregate/rubric score)
};

// An entire run (baseline or current)
export type RunSummary = {
  runId: string;         // id or file path, for display
  createdAt?: string;    // optional timestamp for info
  items: RunItem[];      // the rows for this run
};

// All possible row statuses in the diff table
export type RowStatus =
  | "added"              // present only in current
  | "removed"            // present only in baseline
  | "improved"           // current is better (pass flips false→true or score↑)
  | "regressed"          // current is worse (pass flips true→false or score↓)
  | "changed"            // text changed, but not clearly better or worse
  | "same";              // identical content/metrics

// The unified row shown in the diff table
export type Row = {
  key: string;           // the match key (same key groups baseline/current)
  name?: string;         // display name
  tags?: string[];       // tags for filtering
  baseline?: RunItem;    // matched baseline item (if any)
  current?: RunItem;     // matched current item (if any)
  status: RowStatus;     // classification
  passDelta?: "→pass" | "→fail" | "same" | undefined; // pass change
  scoreDelta?: number | undefined; // current.score - baseline.score
  changed: boolean;      // text output changed?
};