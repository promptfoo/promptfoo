import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import {
  buildObservedOutcomeRows,
  type ObservedOutcomeRow,
  observedOutcomes,
  type PromptProfile,
} from './buildRepairOutcomeTable';
import {
  type SemanticSignature,
  type SignatureEvaluationSummary,
  type SignatureModel,
  type SignaturePrediction,
  signatureModels,
} from './evaluateRepairSemanticSignatures';
import { buildValidatedRepairTaskBenchmark } from './generateRepairTaskBenchmark';
import { jaccardSimilarity, tokenize } from './sqlResearchShared';

type RepresentationArtifact = {
  providerId?: string;
  trialSummaries: Array<{
    signatures?: Record<string, SemanticSignature>;
    trial: number;
  }>;
};

type GatePolicy = 'global' | 'metric-family' | 'plugin-metric-family';

type GatedEvaluationDraw = {
  holdout: Record<GatePolicy, Record<SignatureModel, SignatureEvaluationSummary>>;
  leaveOneOut: Record<GatePolicy, Record<SignatureModel, SignatureEvaluationSummary>>;
  trial: number;
};

const gatePolicies = [
  'global',
  'metric-family',
  'plugin-metric-family',
] as const satisfies readonly GatePolicy[];
const profiles = ['balanced', 'rich', 'thin'] as const satisfies readonly PromptProfile[];

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getTop3Yields(row: ObservedOutcomeRow): Record<PromptProfile, number> {
  return observedOutcomes[row.task.id].top3YieldByProfile;
}

function selectHighestYieldProfile(yields: Record<PromptProfile, number>): PromptProfile {
  return [...profiles].sort((left, right) => yields[right] - yields[left])[0];
}

function regretForPrediction(row: ObservedOutcomeRow, predictedProfile: PromptProfile): number {
  const yields = getTop3Yields(row);
  return yields[row.observedWinner] - yields[predictedProfile];
}

function summarizePredictions(predictions: SignaturePrediction[]): SignatureEvaluationSummary {
  return {
    accuracy:
      predictions.filter((prediction) => prediction.predictedProfile === prediction.actualWinner)
        .length / predictions.length,
    averageRegret:
      predictions.reduce((sum, prediction) => sum + prediction.regret, 0) / predictions.length,
    maxRegret: Math.max(...predictions.map((prediction) => prediction.regret)),
    predictions,
  };
}

function slotMatchSimilarity(left: SemanticSignature, right: SemanticSignature): number {
  return left.labels.reduce(
    (score, label, index) => score + (label === right.labels[index] ? 1 : 0),
    0,
  );
}

function weightedSlotSimilarity(left: SemanticSignature, right: SemanticSignature): number {
  const weights = [1.5, 1.5, 1, 1, 1];
  return left.labels.reduce(
    (score, label, index) => score + (label === right.labels[index] ? (weights[index] ?? 1) : 0),
    0,
  );
}

function signatureSimilarity(
  leftRow: ObservedOutcomeRow,
  rightRow: ObservedOutcomeRow,
  signatures: Record<string, SemanticSignature>,
  model: SignatureModel,
): number {
  const leftSignature = signatures[leftRow.task.id];
  const rightSignature = signatures[rightRow.task.id];

  switch (model) {
    case 'label-1nn-yield':
      return jaccardSimilarity(
        tokenize(leftSignature.labels.join(' ')),
        tokenize(rightSignature.labels.join(' ')),
      );
    case 'slot-match-1nn-yield':
      return slotMatchSimilarity(leftSignature, rightSignature);
    case 'slot-plugin-1nn-yield':
      return (
        slotMatchSimilarity(leftSignature, rightSignature) +
        (leftRow.task.plugin === rightRow.task.plugin ? 1 : 0)
      );
    case 'summary-1nn-yield':
      return jaccardSimilarity(tokenize(leftSignature.summary), tokenize(rightSignature.summary));
    case 'weighted-slot-1nn-yield':
      return weightedSlotSimilarity(leftSignature, rightSignature);
  }
}

function selectTrainingRows(
  trainingRows: ObservedOutcomeRow[],
  targetRow: ObservedOutcomeRow,
  gatePolicy: GatePolicy,
): ObservedOutcomeRow[] {
  if (gatePolicy === 'global') {
    return trainingRows;
  }
  const sameMetricRows = trainingRows.filter(
    (row) => row.task.features.blockedMetricFamily === targetRow.task.features.blockedMetricFamily,
  );
  if (gatePolicy === 'metric-family') {
    return sameMetricRows.length > 0 ? sameMetricRows : trainingRows;
  }
  const samePluginMetricRows = sameMetricRows.filter(
    (row) => row.task.plugin === targetRow.task.plugin,
  );
  if (samePluginMetricRows.length > 0) {
    return samePluginMetricRows;
  }
  return sameMetricRows.length > 0 ? sameMetricRows : trainingRows;
}

function predictByNearestSignature(
  trainingRows: ObservedOutcomeRow[],
  targetRow: ObservedOutcomeRow,
  signatures: Record<string, SemanticSignature>,
  model: SignatureModel,
  gatePolicy: GatePolicy,
): PromptProfile {
  const candidateRows = selectTrainingRows(trainingRows, targetRow, gatePolicy);
  const [nearestNeighbor] = [...candidateRows].sort((left, right) => {
    const rightSimilarity = signatureSimilarity(right, targetRow, signatures, model);
    const leftSimilarity = signatureSimilarity(left, targetRow, signatures, model);
    return rightSimilarity - leftSimilarity;
  });
  return selectHighestYieldProfile(getTop3Yields(nearestNeighbor));
}

function evaluateModels(
  trainingRows: ObservedOutcomeRow[],
  evaluationRows: ObservedOutcomeRow[],
  signatures: Record<string, SemanticSignature>,
  gatePolicy: GatePolicy,
): Record<SignatureModel, SignatureEvaluationSummary> {
  return Object.fromEntries(
    signatureModels.map((model) => [
      model,
      summarizePredictions(
        evaluationRows.map((row) => {
          const predictedProfile = predictByNearestSignature(
            trainingRows,
            row,
            signatures,
            model,
            gatePolicy,
          );
          return {
            actualWinner: row.observedWinner,
            predictedProfile,
            regret: regretForPrediction(row, predictedProfile),
            split: row.task.split,
            taskId: row.task.id,
          };
        }),
      ),
    ]),
  ) as Record<SignatureModel, SignatureEvaluationSummary>;
}

function evaluateLeaveOneOut(
  rows: ObservedOutcomeRow[],
  signatures: Record<string, SemanticSignature>,
  gatePolicy: GatePolicy,
): Record<SignatureModel, SignatureEvaluationSummary> {
  return Object.fromEntries(
    signatureModels.map((model) => [
      model,
      summarizePredictions(
        rows.map((row) => {
          const trainingRows = rows.filter((candidate) => candidate.task.id !== row.task.id);
          const predictedProfile = predictByNearestSignature(
            trainingRows,
            row,
            signatures,
            model,
            gatePolicy,
          );
          return {
            actualWinner: row.observedWinner,
            predictedProfile,
            regret: regretForPrediction(row, predictedProfile),
            split: row.task.split,
            taskId: row.task.id,
          };
        }),
      ),
    ]),
  ) as Record<SignatureModel, SignatureEvaluationSummary>;
}

function summarizeRouteStability(
  draws: GatedEvaluationDraw[],
  scope: 'holdout' | 'leaveOneOut',
  gatePolicy: GatePolicy,
) {
  return Object.fromEntries(
    signatureModels.map((model) => {
      const predictionMap = new Map<string, Set<string>>();
      for (const draw of draws) {
        for (const prediction of draw[scope][gatePolicy][model].predictions) {
          const profiles = predictionMap.get(prediction.taskId) ?? new Set<string>();
          profiles.add(prediction.predictedProfile);
          predictionMap.set(prediction.taskId, profiles);
        }
      }
      const unstableTaskIds = [...predictionMap.entries()]
        .filter(([, predictedProfiles]) => predictedProfiles.size > 1)
        .map(([taskId]) => taskId);
      return [
        model,
        {
          accuracies: draws.map((draw) => draw[scope][gatePolicy][model].accuracy),
          averageAccuracy: mean(draws.map((draw) => draw[scope][gatePolicy][model].accuracy)),
          averageRegret: mean(draws.map((draw) => draw[scope][gatePolicy][model].averageRegret)),
          averageUniquePredictionCount: mean(
            [...predictionMap.values()].map((predictedProfiles) => predictedProfiles.size),
          ),
          regrets: draws.map((draw) => draw[scope][gatePolicy][model].averageRegret),
          stableTaskCount: predictionMap.size - unstableTaskIds.length,
          unstableTaskCount: unstableTaskIds.length,
          unstableTaskIds,
        },
      ];
    }),
  );
}

async function main() {
  const [inputPath, representationArtifactPath] = process.argv.slice(2);
  if (!inputPath || !representationArtifactPath) {
    throw new Error(
      'Usage: tsx scripts/redteam-research/evaluateRepairMetricGatedSemanticSignatureRouting.ts <redteam.yaml> <representation-artifact.json>',
    );
  }
  const artifact = JSON.parse(
    await readFile(representationArtifactPath, 'utf8'),
  ) as RepresentationArtifact;
  if (
    artifact.trialSummaries.length === 0 ||
    artifact.trialSummaries.some((summary) => !summary.signatures)
  ) {
    throw new Error(
      'Representation artifact must include trialSummaries[].signatures for deterministic rerouting.',
    );
  }
  const { accepted } = await buildValidatedRepairTaskBenchmark(inputPath);
  const observedRows = buildObservedOutcomeRows(accepted);
  const trainingRows = observedRows.filter((row) => row.task.split === 'train');
  const holdoutRows = observedRows.filter((row) => row.task.split === 'holdout');
  const draws = artifact.trialSummaries.map((summary) => {
    const signatures = summary.signatures as Record<string, SemanticSignature>;
    return {
      holdout: Object.fromEntries(
        gatePolicies.map((gatePolicy) => [
          gatePolicy,
          evaluateModels(trainingRows, holdoutRows, signatures, gatePolicy),
        ]),
      ) as Record<GatePolicy, Record<SignatureModel, SignatureEvaluationSummary>>,
      leaveOneOut: Object.fromEntries(
        gatePolicies.map((gatePolicy) => [
          gatePolicy,
          evaluateLeaveOneOut(observedRows, signatures, gatePolicy),
        ]),
      ) as Record<GatePolicy, Record<SignatureModel, SignatureEvaluationSummary>>,
      trial: summary.trial,
    };
  });

  console.log(
    JSON.stringify(
      {
        gatePolicies: Object.fromEntries(
          gatePolicies.map((gatePolicy) => [
            gatePolicy,
            {
              holdout: summarizeRouteStability(draws, 'holdout', gatePolicy),
              leaveOneOut: summarizeRouteStability(draws, 'leaveOneOut', gatePolicy),
            },
          ]),
        ),
        providerId: artifact.providerId ?? 'unknown',
        trialCount: draws.length,
        trialSummaries: draws,
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
