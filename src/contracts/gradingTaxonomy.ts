import { z } from 'zod';

/** Identifies the findings expected from a single rubric evaluation. */
export interface GradingTaxonomy {
  id: string;
  version: number;
  categories: Record<
    string,
    {
      description: string;
      /** Allows the matching content only. Omit to apply the policy. */
      allow?: true;
    }
  >;
}

/** A policy decides what is allowed. The taxonomy identifies what was observed. */
export interface StructuredGradingRubric {
  policy: string;
  taxonomy: GradingTaxonomy;
}

export interface TaxonomyFinding {
  label: string;
  observed: boolean;
  pass: boolean;
  reason: string;
  /** Half-open UTF-16 offsets into the evaluated output. */
  evidence: { start: number; end: number }[];
}

/** A validated failing category makes the overall result fail. Preserve other judge failures. */
export function enforceTaxonomyVerdict<
  T extends { pass: boolean; score: number; reason: string; findings?: TaxonomyFinding[] },
>(grade: T): T {
  const failed = grade.findings?.filter((finding) => !finding.pass);
  if (!grade.pass || !failed?.length) {
    return grade;
  }
  return {
    ...grade,
    pass: false,
    score: 0,
    reason: `Failed taxonomy categories: ${failed.map((finding) => finding.label).join(', ')}`,
  };
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
  const labels = Object.keys(taxonomy.categories);
  if (!Array.isArray(raw) || raw.length !== labels.length) {
    return undefined;
  }
  const parsed = judgeFindings.safeParse(raw);
  if (!parsed.success) {
    return undefined;
  }

  const byLabel = new Map(parsed.data.map((finding) => [finding.label, finding]));
  const findings: TaxonomyFinding[] = [];
  for (const label of labels) {
    const finding = byLabel.get(label);
    if (
      !finding ||
      !hasConsistentObservation(finding) ||
      (taxonomy.categories[label].allow && !finding.pass)
    ) {
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
  grade: { findings?: unknown; metadata?: { taxonomy?: Pick<GradingTaxonomy, 'id' | 'version'> } },
  expected: GradingTaxonomy,
  output: string,
): boolean {
  if (
    grade.metadata?.taxonomy?.id !== expected.id ||
    grade.metadata.taxonomy.version !== expected.version
  ) {
    return false;
  }
  const expectedLabels = new Set(Object.keys(expected.categories));
  const parsed = storedFindings.safeParse(grade.findings);
  return (
    parsed.success &&
    parsed.data.length === expectedLabels.size &&
    parsed.data.every(
      (finding) =>
        expectedLabels.delete(finding.label) &&
        hasConsistentObservation(finding) &&
        (!expected.categories[finding.label].allow || finding.pass) &&
        finding.evidence.every(({ start, end }) => start < end && end <= output.length),
    )
  );
}
