import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { buildObservedOutcomeRows, type ObservedOutcomeRow } from './buildRepairOutcomeTable';
import {
  buildSignatureDraw,
  summarizeRouteStability,
  summarizeSignatureStability,
} from './evaluateRepairSemanticSignatureStability';
import { buildValidatedRepairTaskBenchmark } from './generateRepairTaskBenchmark';

import type { SemanticSignature } from './evaluateRepairSemanticSignatures';

type ConstrainedArtifact = {
  trialSummaries: Array<{
    signatures?: Record<string, SemanticSignature>;
  }>;
};

function summarizeLabelTuples(signatures: Record<string, SemanticSignature>) {
  const labelsByTask = Object.fromEntries(
    Object.entries(signatures).map(([taskId, signature]) => [taskId, signature.labels.join('|')]),
  );
  const tupleCounts = Object.values(labelsByTask).reduce<Record<string, number>>(
    (counts, tuple) => {
      counts[tuple] = (counts[tuple] ?? 0) + 1;
      return counts;
    },
    {},
  );
  return {
    labelsByTask,
    tupleCounts,
    uniqueTupleCount: Object.keys(tupleCounts).length,
  };
}

function requesterRoleForTask(row: ObservedOutcomeRow): string {
  const prompt = row.task.candidatePrompt.toLowerCase();
  if (prompt.includes('security access review')) {
    return 'requester-role:security-reviewer';
  }
  if (prompt.includes('vendor support') || prompt.includes('vendor escalation')) {
    return 'requester-role:vendor-support';
  }
  if (prompt.includes('outside counsel')) {
    return 'requester-role:legal-counsel';
  }
  if (prompt.includes('insurer')) {
    return 'requester-role:insurer';
  }
  if (prompt.includes('audit')) {
    return 'requester-role:auditor';
  }
  if (prompt.includes('billing')) {
    return 'requester-role:billing';
  }
  return 'requester-role:unknown';
}

function augmentWithRequesterRole(
  rows: ObservedOutcomeRow[],
  signatures: Record<string, SemanticSignature>,
): Record<string, SemanticSignature> {
  return Object.fromEntries(
    rows.map((row) => [
      row.task.id,
      {
        labels: [...signatures[row.task.id].labels, requesterRoleForTask(row)],
        summary: signatures[row.task.id].summary,
      },
    ]),
  );
}

async function main() {
  const [inputPath, constrainedArtifactPath] = process.argv.slice(2);
  if (!inputPath || !constrainedArtifactPath) {
    throw new Error(
      'Usage: tsx scripts/redteam-research/evaluateRepairDeterministicRoleAwareSemanticSignatureStability.ts <redteam.yaml> <constrained-artifact.json>',
    );
  }
  const artifact = JSON.parse(
    await readFile(constrainedArtifactPath, 'utf8'),
  ) as ConstrainedArtifact;
  if (
    artifact.trialSummaries.length === 0 ||
    artifact.trialSummaries.some((summary) => !summary.signatures)
  ) {
    throw new Error(
      'Constrained artifact must include trialSummaries[].signatures for deterministic augmentation.',
    );
  }
  const { accepted } = await buildValidatedRepairTaskBenchmark(inputPath);
  const observedRows = buildObservedOutcomeRows(accepted);
  const draws = await Promise.all(
    artifact.trialSummaries.map(async (summary, index) => {
      const signatures = augmentWithRequesterRole(
        observedRows,
        summary.signatures as Record<string, SemanticSignature>,
      );
      return buildSignatureDraw(
        observedRows,
        'deterministic:requester-role',
        index + 1,
        async (row) => signatures[row.task.id],
      );
    }),
  );

  console.log(
    JSON.stringify(
      {
        providerId: 'deterministic:requester-role',
        routeStability: {
          holdout: summarizeRouteStability(draws, 'holdout'),
          leaveOneOut: summarizeRouteStability(draws, 'leaveOneOut'),
        },
        signatureStability: summarizeSignatureStability(draws),
        trialSummaries: draws.map((draw) => ({
          holdout: draw.holdout,
          labelTuples: summarizeLabelTuples(draw.signatures),
          leaveOneOut: draw.leaveOneOut,
          signatures: draw.signatures,
          trial: draw.trial,
        })),
        trialCount: draws.length,
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
