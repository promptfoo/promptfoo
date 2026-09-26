import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Stable JSON identity for a frozen definition or review, not a signature.
export function evidenceHash(value) {
  const canonical = (item) => {
    if (Array.isArray(item)) {
      return item.map(canonical);
    }
    if (item && typeof item === 'object') {
      return Object.fromEntries(
        Object.keys(item)
          .sort()
          .map((key) => [key, canonical(item[key])]),
      );
    }
    return item;
  };
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

const requireEvidence = (condition, reason) => {
  if (!condition) {
    throw new Error(reason);
  }
};
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const uniqueStrings = (value) =>
  Array.isArray(value) && value.every(nonempty) && new Set(value).size === value.length;
const scopeKey = (scope) => {
  requireEvidence(
    scope && uniqueStrings(scope.includePaths) && uniqueStrings(scope.excludePaths),
    'scope paths must be known, unique arrays (explicit empty arrays are allowed)',
  );
  return JSON.stringify([[...scope.includePaths].sort(), [...scope.excludePaths].sort()]);
};

export function completedScan(_output, context) {
  const status = context.metadata?.codexSecurity?.status ?? 'unknown';
  return {
    pass: status === 'completed',
    score: Number(status === 'completed'),
    reason: `Recorded scan status: ${status}`,
  };
}

export function completeCoverage(_output, context) {
  const result = context.metadata?.codexSecurity;
  const coverage = result?.coverage?.completeness ?? 'unknown';
  return {
    pass: coverage === 'complete',
    score: Number(coverage === 'complete'),
    reason: `Recorded coverage: ${coverage}; ${result?.warnings?.length ?? 0} retained warnings. Missing diagnostics do not establish that no warnings occurred.`,
  };
}

function loadBenchmark(context) {
  let benchmark = context.config?.benchmark ?? context.vars?.benchmark;
  if (typeof benchmark === 'string' && benchmark.startsWith('file://')) {
    const file = resolve(
      dirname(fileURLToPath(import.meta.url)),
      benchmark.slice('file://'.length),
    );
    benchmark = JSON.parse(readFileSync(file, 'utf8'));
  }
  return benchmark;
}

// Use without assertion.metric: unscored cases must not create a zero recall.
export function gradeBenchmark(output, context) {
  try {
    const result = context.metadata?.codexSecurity;
    requireEvidence(
      result?.version === 1 &&
        result.source?.kind === 'saved-report' &&
        result.source.mocked === false &&
        result.status === 'completed',
      'need a completed, non-mocked saved scan',
    );
    const benchmark = loadBenchmark(context);
    const definition = benchmark?.definition;
    requireEvidence(
      definition &&
        hash(benchmark.definitionSha256) &&
        evidenceHash(definition) === benchmark.definitionSha256,
      'frozen benchmark definition hash missing or mismatched',
    );
    requireEvidence(
      nonempty(definition.revision) && result.target?.revision === definition.revision,
      'source revision missing or mismatched',
    );
    requireEvidence(
      hash(definition.sourceSnapshotSha256) && hash(definition.groundTruthSha256),
      'frozen source snapshot and ground-truth hashes are required',
    );
    requireEvidence(scopeKey(definition.scope) === scopeKey(result.scope), 'source scope differs');
    requireEvidence(
      uniqueStrings(definition.expectedIds) && definition.expectedIds.length > 0,
      'expected IDs must be unique and nonempty; a zero denominator is undefined',
    );
    requireEvidence(hash(result.source.sha256), 'imported file hash missing');
    const receipt = benchmark.reports?.[result.source.sha256];
    const review = receipt?.review;
    requireEvidence(
      review && hash(receipt.reviewSha256) && evidenceHash(review) === receipt.reviewSha256,
      'review missing or its frozen hash differs',
    );
    requireEvidence(
      review.definitionSha256 === benchmark.definitionSha256,
      'review belongs to a different frozen benchmark',
    );
    requireEvidence(
      review.protocolValid === true && review.provenanceValid === true,
      review.ineligibleReason || 'source-reading protocol or run provenance was not verified',
    );

    const raw = typeof output === 'string' ? JSON.parse(output) : output;
    const ids = raw?.findings?.findings?.map((finding) => finding.findingId);
    requireEvidence(
      uniqueStrings(ids),
      'current finding IDs missing or duplicated; use the original SDK output',
    );
    requireEvidence(
      review.findings &&
        typeof review.findings === 'object' &&
        !Array.isArray(review.findings) &&
        Object.keys(review.findings).length === ids.length &&
        ids.every((id) => Object.hasOwn(review.findings, id)),
      'every current finding needs an adjudication',
    );
    const expected = new Set(definition.expectedIds);
    const groups = new Map();
    let claimCount = 0;
    for (const id of ids) {
      const claims = review.findings[id];
      requireEvidence(
        Array.isArray(claims) && claims.length > 0,
        `finding ${id} needs at least one reviewed claim`,
      );
      for (const claim of claims) {
        requireEvidence(
          nonempty(claim.rootCauseId) &&
            nonempty(claim.evidence) &&
            ['supported', 'refuted', 'unresolved'].includes(claim.verdict) &&
            typeof claim.inScope === 'boolean' &&
            uniqueStrings(claim.expectedIds) &&
            claim.expectedIds.every((expectedId) => expected.has(expectedId)),
          `invalid claim in ${id}`,
        );
        requireEvidence(
          claim.expectedIds.length === 0 || (claim.verdict === 'supported' && claim.inScope),
          `only supported, in-scope claims can match expected IDs (${id})`,
        );
        const prior = groups.get(claim.rootCauseId);
        requireEvidence(
          !prior ||
            (prior.verdict === claim.verdict &&
              prior.inScope === claim.inScope &&
              JSON.stringify([...prior.expectedIds].sort()) ===
                JSON.stringify([...claim.expectedIds].sort())),
          `inconsistent duplicate root cause ${claim.rootCauseId}`,
        );
        groups.set(claim.rootCauseId, claim);
        claimCount += 1;
      }
    }
    const inScope = [...groups.values()].filter((claim) => claim.inScope);
    const supported = inScope.filter((claim) => claim.verdict === 'supported').length;
    const refuted = inScope.filter((claim) => claim.verdict === 'refuted').length;
    const unresolved = inScope.filter((claim) => claim.verdict === 'unresolved').length;
    const matched = new Set(inScope.flatMap((claim) => claim.expectedIds));
    const recall = matched.size / expected.size;
    const total = supported + refuted + unresolved;
    const precision = {
      supported,
      refuted,
      unresolved,
      resolved: supported + refuted ? supported / (supported + refuted) : null,
      lower: total ? supported / total : null,
      upper: total ? (supported + unresolved) / total : null,
    };
    return {
      pass: recall === 1 && (total === 0 || precision.lower === 1),
      score: recall,
      reason: `${matched.size}/${expected.size} curated causes found; ${supported} supported, ${refuted} refuted, ${unresolved} unresolved unique in-scope claims. Coverage: ${result.coverage?.completeness ?? 'unknown'}.`,
      namedScores: {
        CuratedRecall: recall,
        ...(total ? { PrecisionLower: precision.lower, PrecisionUpper: precision.upper } : {}),
      },
      metadata: {
        quality: {
          status: 'scored',
          curatedRecall: recall,
          precision,
          matchedExpectedIds: [...matched].sort(),
          expectedCount: expected.size,
          findingCount: ids.length,
          claimCount,
          duplicateClaims: claimCount - groups.size,
          definitionSha256: benchmark.definitionSha256,
          reviewSha256: receipt.reviewSha256,
          reportSha256: result.source.sha256,
        },
      },
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      pass: false,
      score: 0,
      reason: `Not scored: ${reason}`,
      metadata: { quality: { status: 'not-scored', reason, curatedRecall: null, precision: null } },
    };
  }
}
