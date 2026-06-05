/**
 * Injection seam so the core grading matcher can resolve blob-backed image outputs
 * without importing the legacy-runtime blob store (`src/blobs`). The evaluator
 * (legacy-runtime) registers a resolver at module load; tests register one in setup.
 * Keeps the core matcher from reaching into storage (dependencies point inward).
 */
export type GradingBlobResolver = (hash: string) => Promise<{ data: Buffer; mimeType?: string }>;

let resolver: GradingBlobResolver | undefined;

export function setGradingBlobResolver(next: GradingBlobResolver | undefined): void {
  resolver = next;
}

export function getGradingBlobResolver(): GradingBlobResolver | undefined {
  return resolver;
}
