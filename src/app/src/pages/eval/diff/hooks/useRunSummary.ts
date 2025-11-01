// src/pages/eval/diff/hooks/useRunSummary.ts
import { useEffect, useState } from "react";
import { RunSummary, RunItem } from "../lib/types";

// Normalizes arbitrary backend payloads to our RunSummary shape
function normalize(raw: any, runId: string): RunSummary {
  // Map whatever the backend gives to RunItem[]
  const items: RunItem[] = (raw.items ?? raw.results ?? []).map((it: any) => ({
    key: it.key ?? it.id ?? it.testKey ?? "",                         // pick a stable key if present
    name: it.name ?? it.title ?? it.testName ?? undefined,            // human label
    tags: it.tags ?? it.labels ?? [],                                 // tags/labels
    output: typeof it.output === "string" ? it.output : JSON.stringify(it.output ?? ""), // stringify if not string
    pass: typeof it.pass === "boolean" ? it.pass : it.assertionPass ?? undefined,         // adapt field names
    score:
      typeof it.score === "number"
        ? it.score
        : typeof it.aggregateScore === "number"
        ? it.aggregateScore
        : undefined,                                                  // adapt numeric metric name
  }));

  return {
    runId,                                                            // identifier we loaded (id or path)
    createdAt: raw.createdAt ?? raw.timestamp ?? undefined,           // keep around for info
    items,                                                            // normalized items
  };
}

// Simple fetch that supports either /api/runs/:id or static json paths
async function fetchJson(pathOrId: string): Promise<any> {
  // Heuristic: treat strings ending with .json or containing a slash as file paths
  const isFile = /\.json$/i.test(pathOrId) || pathOrId.includes("/");
  if (isFile) {
    // Vite dev server can serve files under /src or /public
    const url = pathOrId.startsWith("/") ? pathOrId : `/${pathOrId}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${pathOrId}`);
    return res.json();
  }

  // Otherwise assume an API route like /api/runs/:id
  const res = await fetch(`/api/runs/${encodeURIComponent(pathOrId)}`);
  if (!res.ok) throw new Error(`Failed to fetch run ${pathOrId}`);
  return res.json();
}

// Hook that loads and normalizes a run by id or path
export function useRunSummary(idOrPath?: string) {
  const [data, setData] = useState<RunSummary | undefined>(); // normalized run
  const [error, setError] = useState<string | undefined>();   // error text
  const [loading, setLoading] = useState(false);              // loading flag

  useEffect(() => {
    let cancelled = false;            // prevents setState on unmounted component
    if (!idOrPath) {                  // if param missing, reset state
      setData(undefined);
      return;
    }
    setLoading(true);
    fetchJson(idOrPath)
      .then((raw) => {                // fetch run payload
        if (!cancelled) setData(normalize(raw, idOrPath)); // normalize → state
      })
      .catch((e) => !cancelled && setError(String(e)))     // surface errors
      .finally(() => !cancelled && setLoading(false));     // stop loading
    return () => { cancelled = true };                     // cleanup
  }, [idOrPath]);                                          // re-run when id/path changes

  return { data, error, loading } as const;                 // tuple-like return
}