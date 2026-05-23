import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { buildObservedOutcomeRows, type ObservedOutcomeRow } from './buildRepairOutcomeTable';
import {
  type SemanticSignature,
  type SignaturePrediction,
} from './evaluateRepairSemanticSignatures';
import { buildValidatedRepairTaskBenchmark } from './generateRepairTaskBenchmark';
import { jaccardSimilarity, tokenize } from './sqlResearchShared';

type RepresentationArtifact = {
  trialSummaries: Array<{
    signatures?: Record<string, SemanticSignature>;
    trial: number;
  }>;
};

type HybridArtifact = {
  trialSummaries: Array<{
    holdout: {
      global: {
        'label-1nn-yield': {
          predictions: SignaturePrediction[];
        };
      };
    };
    trial: number;
  }>;
};

type ResidualDiagnosis = 'local-ambiguity' | 'sparse-support' | 'unclassified';

type ResidualSummary = {
  diagnosis: ResidualDiagnosis;
  nearestConflictingWinner: NeighborSummary | null;
  nearestSameWinner: NeighborSummary | null;
  samePluginSupportCountAtThreshold: number;
  taskId: string;
  trainingSupportCountAtThreshold: number;
  trial: number;
};

type NeighborSummary = {
  observedWinner: string;
  similarity: number;
  taskId: string;
};

const supportThreshold = 0.5;
const localAmbiguityThreshold = 0.75;

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function signatureSimilarity(left: SemanticSignature, right: SemanticSignature): number {
  return jaccardSimilarity(tokenize(left.labels.join(' ')), tokenize(right.labels.join(' ')));
}

function summarizeNearestNeighbor(
  targetRow: ObservedOutcomeRow,
  candidateRows: ObservedOutcomeRow[],
  signatures: Record<string, SemanticSignature>,
): NeighborSummary | null {
  const [nearestNeighbor] = [...candidateRows].sort(
    (left, right) =>
      signatureSimilarity(signatures[right.task.id], signatures[targetRow.task.id]) -
      signatureSimilarity(signatures[left.task.id], signatures[targetRow.task.id]),
  );
  if (!nearestNeighbor) {
    return null;
  }
  return {
    observedWinner: nearestNeighbor.observedWinner,
    similarity: signatureSimilarity(
      signatures[nearestNeighbor.task.id],
      signatures[targetRow.task.id],
    ),
    taskId: nearestNeighbor.task.id,
  };
}

function diagnoseResidual({
  allRows,
  signatures,
  targetRow,
  trainingRows,
}: {
  allRows: ObservedOutcomeRow[];
  signatures: Record<string, SemanticSignature>;
  targetRow: ObservedOutcomeRow;
  trainingRows: ObservedOutcomeRow[];
}): Omit<ResidualSummary, 'taskId' | 'trial'> {
  const samePluginRows = allRows.filter(
    (row) => row.task.id !== targetRow.task.id && row.task.plugin === targetRow.task.plugin,
  );
  const samePluginTrainingRows = trainingRows.filter(
    (row) => row.task.plugin === targetRow.task.plugin,
  );
  const nearestConflictingWinner = summarizeNearestNeighbor(
    targetRow,
    samePluginRows.filter((row) => row.observedWinner !== targetRow.observedWinner),
    signatures,
  );
  const nearestSameWinner = summarizeNearestNeighbor(
    targetRow,
    samePluginRows.filter((row) => row.observedWinner === targetRow.observedWinner),
    signatures,
  );
  const samePluginSupportCountAtThreshold = samePluginRows.filter(
    (row) =>
      signatureSimilarity(signatures[row.task.id], signatures[targetRow.task.id]) >=
      supportThreshold,
  ).length;
  const trainingSupportCountAtThreshold = samePluginTrainingRows.filter(
    (row) =>
      signatureSimilarity(signatures[row.task.id], signatures[targetRow.task.id]) >=
      supportThreshold,
  ).length;

  let diagnosis: ResidualDiagnosis = 'unclassified';
  if ((nearestConflictingWinner?.similarity ?? 0) >= localAmbiguityThreshold) {
    diagnosis = 'local-ambiguity';
  } else if (trainingSupportCountAtThreshold === 0) {
    diagnosis = 'sparse-support';
  }

  return {
    diagnosis,
    nearestConflictingWinner,
    nearestSameWinner,
    samePluginSupportCountAtThreshold,
    trainingSupportCountAtThreshold,
  };
}

function summarizeResiduals(residuals: ResidualSummary[]) {
  return Object.fromEntries(
    [...new Set(residuals.map((residual) => residual.taskId))].map((taskId) => {
      const taskResiduals = residuals.filter((residual) => residual.taskId === taskId);
      const meanNearestConflictingWinnerSimilarity = mean(
        taskResiduals.map((residual) => residual.nearestConflictingWinner?.similarity ?? 0),
      );
      const meanNearestSameWinnerSimilarity = mean(
        taskResiduals.map((residual) => residual.nearestSameWinner?.similarity ?? 0),
      );
      const meanSamePluginSupportCountAtThreshold = mean(
        taskResiduals.map((residual) => residual.samePluginSupportCountAtThreshold),
      );
      const meanTrainingSupportCountAtThreshold = mean(
        taskResiduals.map((residual) => residual.trainingSupportCountAtThreshold),
      );
      let aggregateDiagnosis: ResidualDiagnosis = 'unclassified';
      if (meanNearestConflictingWinnerSimilarity >= localAmbiguityThreshold) {
        aggregateDiagnosis = 'local-ambiguity';
      } else if (meanTrainingSupportCountAtThreshold === 0) {
        aggregateDiagnosis = 'sparse-support';
      }
      return [
        taskId,
        {
          aggregateDiagnosis,
          diagnoses: [...new Set(taskResiduals.map((residual) => residual.diagnosis))],
          meanNearestConflictingWinnerSimilarity,
          meanNearestSameWinnerSimilarity,
          meanSamePluginSupportCountAtThreshold,
          meanTrainingSupportCountAtThreshold,
        },
      ];
    }),
  );
}

async function main() {
  const [inputPath, representationArtifactPath, hybridArtifactPath] = process.argv.slice(2);
  if (!inputPath || !representationArtifactPath || !hybridArtifactPath) {
    throw new Error(
      'Usage: tsx scripts/redteam-research/diagnoseRepairResidualFamilies.ts <redteam.yaml> <representation-artifact.json> <hybrid-artifact.json>',
    );
  }
  const representationArtifact = JSON.parse(
    await readFile(representationArtifactPath, 'utf8'),
  ) as RepresentationArtifact;
  const hybridArtifact = JSON.parse(await readFile(hybridArtifactPath, 'utf8')) as HybridArtifact;
  if (
    representationArtifact.trialSummaries.length === 0 ||
    representationArtifact.trialSummaries.some((summary) => !summary.signatures)
  ) {
    throw new Error('Representation artifact must include trialSummaries[].signatures.');
  }
  const hybridByTrial = new Map(
    hybridArtifact.trialSummaries.map((summary) => [summary.trial, summary]),
  );
  const { accepted } = await buildValidatedRepairTaskBenchmark(inputPath);
  const observedRows = buildObservedOutcomeRows(accepted);
  const trainingRows = observedRows.filter((row) => row.task.split === 'train');
  const residuals: ResidualSummary[] = [];

  for (const summary of representationArtifact.trialSummaries) {
    const hybridSummary = hybridByTrial.get(summary.trial);
    if (!hybridSummary) {
      throw new Error(`Missing hybrid trial ${summary.trial}.`);
    }
    const signatures = summary.signatures as Record<string, SemanticSignature>;
    const mispredictedTaskIds = hybridSummary.holdout.global['label-1nn-yield'].predictions
      .filter((prediction) => prediction.predictedProfile !== prediction.actualWinner)
      .map((prediction) => prediction.taskId);
    for (const taskId of mispredictedTaskIds) {
      const targetRow = observedRows.find((row) => row.task.id === taskId);
      if (!targetRow) {
        throw new Error(`Missing observed row for ${taskId}.`);
      }
      residuals.push({
        ...diagnoseResidual({
          allRows: observedRows,
          signatures,
          targetRow,
          trainingRows,
        }),
        taskId,
        trial: summary.trial,
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        thresholds: {
          localAmbiguityThreshold,
          supportThreshold,
        },
        residuals,
        summaryByTask: summarizeResiduals(residuals),
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
