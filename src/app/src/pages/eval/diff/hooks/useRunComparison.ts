// src/pages/eval/diff/hooks/useRunComparison.ts
import { useMemo } from "react";
import { buildRows } from "../lib/match";
import { Row } from "../lib/types";
import Fuse from "fuse.js";

// Filters state shape the page will pass in
export type Filters = {
  statuses: Set<Row["status"]> | null; // null = no filter on status
  changedOnly: boolean;                // hide "same"
  tags: Set<string> | null;            // limit to selected tags
  q: string;                           // search query
};

// Build rows once from baseline/current; then filter/search/summarize
export function useRunComparison(baseline?: any, current?: any, filters?: Filters) {
  // 1) Build unified rows (classification) whenever inputs change
  const rows = useMemo(() => buildRows(baseline, current), [baseline, current]);

  // 2) Apply filters + fuzzy search
  const filtered = useMemo(() => {
    let r = rows;

    if (filters?.changedOnly) {
      r = r.filter((x) => x.status !== "same");
    }

    if (filters?.statuses && filters.statuses.size > 0) {
      r = r.filter((x) => filters.statuses!.has(x.status));
    }

    if (filters?.tags && filters.tags.size > 0) {
      r = r.filter((x) => (x.tags ?? []).some((t) => filters.tags!.has(t)));
    }

    if (filters?.q) {
      const fuse = new Fuse(r, {
        keys: ["name", "key", "tags"], // search across these
        threshold: 0.4,                // fuzzy tolerance
        includeScore: false,
      });
      r = fuse.search(filters.q).map((m) => m.item);
    }

    return r;
  }, [rows, filters?.changedOnly, filters?.q, filters?.statuses, filters?.tags]);

  // 3) Summary counts for header chips
  const summary = useMemo(() => {
    const counts: Record<string, number> = { added: 0, removed: 0, improved: 0, regressed: 0, changed: 0, same: 0 };
    for (const r of rows) counts[r.status]++;
    return counts;
  }, [rows]);

  return { rows, filtered, summary } as const;
}