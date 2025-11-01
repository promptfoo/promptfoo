// src/pages/eval/diff/lib/match.ts
import { RunSummary, Row, RowStatus, RunItem } from "./types";

// Decide the status for a baseline/current pair + whether text changed
function classify(
  b?: RunItem,           // baseline item
  c?: RunItem,           // current item
  changed?: boolean      // did the output text change?
): { status: RowStatus; passDelta?: Row["passDelta"]; scoreDelta?: number } {
  // If only current exists → added
  if (!b && c) return { status: "added" };
  // If only baseline exists → removed
  if (b && !c) return { status: "removed" };
  // If both are missing (shouldn’t happen) → treat as same
  if (!b || !c) return { status: "same" };

  // Pull numeric scores if present
  const bScore = typeof b.score === "number" ? b.score : undefined;
  const cScore = typeof c.score === "number" ? c.score : undefined;
  // Compute score delta if both exist
  const scoreDelta =
    bScore !== undefined && cScore !== undefined ? cScore - bScore : undefined;

  // Compute pass delta (→pass / →fail / same) if both booleans exist
  let passDelta: Row["passDelta"] = undefined;
  if (typeof b.pass === "boolean" && typeof c.pass === "boolean") {
    if (!b.pass && c.pass) passDelta = "→pass";
    else if (b.pass && !c.pass) passDelta = "→fail";
    else passDelta = "same";
  }

  // Prioritize pass changes first
  if (passDelta === "→pass") return { status: "improved", passDelta, scoreDelta };
  if (passDelta === "→fail") return { status: "regressed", passDelta, scoreDelta };

  // Then score deltas
  if (scoreDelta !== undefined) {
    if (scoreDelta > 0) return { status: "improved", passDelta, scoreDelta };
    if (scoreDelta < 0) return { status: "regressed", passDelta, scoreDelta };
  }

  // Otherwise, if text changed but not clearly better/worse → changed
  if (changed) return { status: "changed", passDelta, scoreDelta };

  // Else → same
  return { status: "same", passDelta, scoreDelta };
}

// Build the union of rows (baseline ∪ current) and classify each
export function buildRows(
  baseline?: RunSummary,
  current?: RunSummary
): Row[] {
  // Index baseline/current by key for O(1) lookup
  const bMap = new Map<string, RunItem>();
  const cMap = new Map<string, RunItem>();

  baseline?.items.forEach((i) => bMap.set(i.key, i));
  current?.items.forEach((i) => cMap.set(i.key, i));

  // Union of keys across both runs
  const keys = new Set<string>([...bMap.keys(), ...cMap.keys()]);

  const rows: Row[] = [];
  for (const key of keys) {
    const b = bMap.get(key);                           // baseline row (maybe undefined)
    const c = cMap.get(key);                           // current row (maybe undefined)
    const name = c?.name ?? b?.name;                   // prefer current name if present
    const tags = c?.tags ?? b?.tags;                   // prefer current tags if present
    const changed = !!(b && c && b.output !== c.output); // text changed?

    // Determine status + deltas
    const { status, passDelta, scoreDelta } = classify(b, c, changed);

    // Push the unified row
    rows.push({ key, name, tags, baseline: b, current: c, status, passDelta, scoreDelta, changed });
  }

  // Sort rows stably by key for consistent rendering
  return rows.sort((r1, r2) => r1.key.localeCompare(r2.key));
}