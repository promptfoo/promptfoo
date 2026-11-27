import { z } from 'zod';

import type { GradingResult, GradingTaxonomy, TaxonomyFinding } from '../types/index';

export interface TaxonomyRubric {
  id: string;
  version: number;
  /** Each stable label maps to the grading criteria for that category. */
  categories: Record<string, string>;
}

const findingFields = z.object({
  label: z.string(),
  observed: z.boolean(),
  pass: z.boolean(),
  reason: z.string().trim().min(1),
});

function hasConsistentObservation(finding: {
  observed: boolean;
  pass: boolean;
  evidence: unknown[];
}): boolean {
  return finding.observed
    ? finding.evidence.length > 0
    : finding.pass && finding.evidence.length === 0;
}

const judgeFindings = z.array(findingFields.extend({ evidence: z.array(z.string().min(1)) }));

/** Only persist a complete classification with evidence grounded in the evaluated response. */
export function parseTaxonomyFindings(
  raw: unknown,
  taxonomy: GradingTaxonomy,
  output: string,
): TaxonomyFinding[] | undefined {
  if (!Array.isArray(raw) || raw.length !== taxonomy.labels.length) {
    return undefined;
  }
  const parsed = judgeFindings.safeParse(raw);
  if (!parsed.success) {
    return undefined;
  }

  const byLabel = new Map(parsed.data.map((finding) => [finding.label, finding]));
  const findings: TaxonomyFinding[] = [];
  for (const label of taxonomy.labels) {
    const finding = byLabel.get(label);
    if (!finding || !hasConsistentObservation(finding)) {
      return undefined;
    }
    const evidence = [];
    for (const quote of finding.evidence) {
      const start = output.indexOf(quote);
      if (start === -1) {
        return undefined;
      }
      evidence.push({ start, end: start + quote.length });
    }
    findings.push({ ...finding, evidence });
  }
  return findings;
}

const storedFindings = z.array(
  findingFields.strict().extend({
    evidence: z.array(
      z.strictObject({ start: z.number().int().nonnegative(), end: z.number().int().positive() }),
    ),
  }),
);

/** Saved and remote grades carry offsets rather than the judge's original excerpts. */
export function hasMatchingTaxonomy(
  grade: GradingResult,
  expected: GradingTaxonomy,
  output: string,
): boolean {
  if (
    grade.metadata?.taxonomy?.id !== expected.id ||
    grade.metadata.taxonomy.version !== expected.version
  ) {
    return false;
  }
  const parsed = storedFindings.safeParse(grade.findings);
  return (
    parsed.success &&
    parsed.data.length === expected.labels.length &&
    parsed.data.every(
      (finding, index) =>
        finding.label === expected.labels[index] &&
        hasConsistentObservation(finding) &&
        finding.evidence.every(({ start, end }) => start < end && end <= output.length),
    )
  );
}
