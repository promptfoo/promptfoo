import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { buildObservedOutcomeRows, observedOutcomes } from './buildRepairOutcomeTable';
import { buildValidatedRepairTaskBenchmark } from './generateRepairTaskBenchmark';
import { jaccardSimilarity, tokenize } from './sqlResearchShared';

import type { SemanticSignature } from './evaluateRepairSemanticSignatures';

type RepresentationArtifact = {
  trialSummaries: Array<{
    signatures?: Record<string, SemanticSignature>;
    trial: number;
  }>;
};

type ResidualPairSummary = {
  candidatePromptSimilarity: number;
  candidatePromptTokenOverlap: string[];
  leftTaskId: string;
  observedWinnerGap: {
    balanced: number;
    thin: number;
  };
  rightTaskId: string;
  semanticLabelSetSimilarity: number;
  semanticSlotAgreement: number;
  semanticSummarySimilarity: number;
  trial: number;
};

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function labelSetSimilarity(left: SemanticSignature, right: SemanticSignature): number {
  return jaccardSimilarity([...new Set(left.labels)], [...new Set(right.labels)]);
}

function labelSlotAgreement(left: SemanticSignature, right: SemanticSignature): number {
  return (
    left.labels.filter((label, index) => label === right.labels[index]).length / left.labels.length
  );
}

function summarySimilarity(left: SemanticSignature, right: SemanticSignature): number {
  return jaccardSimilarity(tokenize(left.summary), tokenize(right.summary));
}

function tokenOverlap(left: string, right: string): string[] {
  const rightTokens = new Set(tokenize(right));
  return [...new Set(tokenize(left))].filter((token) => rightTokens.has(token)).sort();
}

async function main() {
  const [inputPath, representationArtifactPath] = process.argv.slice(2);
  if (!inputPath || !representationArtifactPath) {
    throw new Error(
      'Usage: tsx scripts/redteam-research/diagnoseRepairBolaResidual.ts <redteam.yaml> <representation-artifact.json>',
    );
  }
  const artifact = JSON.parse(
    await readFile(representationArtifactPath, 'utf8'),
  ) as RepresentationArtifact;
  if (
    artifact.trialSummaries.length === 0 ||
    artifact.trialSummaries.some((summary) => !summary.signatures)
  ) {
    throw new Error('Representation artifact must include trialSummaries[].signatures.');
  }
  const { accepted } = await buildValidatedRepairTaskBenchmark(inputPath);
  const observedRows = buildObservedOutcomeRows(accepted);
  const leftRow = observedRows.find((row) => row.task.id === 'bola-coverage-v1');
  const rightRow = observedRows.find((row) => row.task.id === 'bola-coverage-v2');
  if (!leftRow || !rightRow) {
    throw new Error('Expected bola-coverage-v1 and bola-coverage-v2 to exist in observed rows.');
  }
  const pairSummaries: ResidualPairSummary[] = artifact.trialSummaries.map((summary) => {
    const signatures = summary.signatures as Record<string, SemanticSignature>;
    const leftSignature = signatures[leftRow.task.id];
    const rightSignature = signatures[rightRow.task.id];
    return {
      candidatePromptSimilarity: jaccardSimilarity(
        tokenize(leftRow.task.candidatePrompt),
        tokenize(rightRow.task.candidatePrompt),
      ),
      candidatePromptTokenOverlap: tokenOverlap(
        leftRow.task.candidatePrompt,
        rightRow.task.candidatePrompt,
      ),
      leftTaskId: leftRow.task.id,
      observedWinnerGap: {
        balanced:
          observedOutcomes[rightRow.task.id].top3YieldByProfile.balanced -
          observedOutcomes[leftRow.task.id].top3YieldByProfile.balanced,
        thin:
          observedOutcomes[rightRow.task.id].top3YieldByProfile.thin -
          observedOutcomes[leftRow.task.id].top3YieldByProfile.thin,
      },
      rightTaskId: rightRow.task.id,
      semanticLabelSetSimilarity: labelSetSimilarity(leftSignature, rightSignature),
      semanticSlotAgreement: labelSlotAgreement(leftSignature, rightSignature),
      semanticSummarySimilarity: summarySimilarity(leftSignature, rightSignature),
      trial: summary.trial,
    };
  });

  console.log(
    JSON.stringify(
      {
        averages: {
          candidatePromptSimilarity: mean(
            pairSummaries.map((summary) => summary.candidatePromptSimilarity),
          ),
          semanticLabelSetSimilarity: mean(
            pairSummaries.map((summary) => summary.semanticLabelSetSimilarity),
          ),
          semanticSlotAgreement: mean(
            pairSummaries.map((summary) => summary.semanticSlotAgreement),
          ),
          semanticSummarySimilarity: mean(
            pairSummaries.map((summary) => summary.semanticSummarySimilarity),
          ),
        },
        pairSummaries,
        rows: {
          left: {
            candidatePrompt: leftRow.task.candidatePrompt,
            observedWinner: leftRow.observedWinner,
            top3YieldByProfile: observedOutcomes[leftRow.task.id].top3YieldByProfile,
          },
          right: {
            candidatePrompt: rightRow.task.candidatePrompt,
            observedWinner: rightRow.observedWinner,
            top3YieldByProfile: observedOutcomes[rightRow.task.id].top3YieldByProfile,
          },
        },
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
