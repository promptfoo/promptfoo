import { pathToFileURL } from 'node:url';

import { buildObservedOutcomeRows, type ObservedOutcomeRow } from './buildRepairOutcomeTable';
import {
  evaluateLeaveOneOut,
  evaluateModels,
  generateSemanticSignature,
  type SemanticSignature,
  type SignatureEvaluationSummary,
  type SignatureModel,
  signatureModels,
} from './evaluateRepairSemanticSignatures';
import { buildValidatedRepairTaskBenchmark } from './generateRepairTaskBenchmark';
import { jaccardSimilarity, tokenize } from './sqlResearchShared';

export type SignatureDraw = {
  holdout: Record<SignatureModel, SignatureEvaluationSummary>;
  leaveOneOut: Record<SignatureModel, SignatureEvaluationSummary>;
  signatures: Record<string, SemanticSignature>;
  trial: number;
};

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function labelSlotAgreement(left: SemanticSignature, right: SemanticSignature): number {
  return (
    left.labels.filter((label, index) => label === right.labels[index]).length / left.labels.length
  );
}

function labelSetSimilarity(left: SemanticSignature, right: SemanticSignature): number {
  return jaccardSimilarity([...new Set(left.labels)], [...new Set(right.labels)]);
}

function summarySimilarity(left: SemanticSignature, right: SemanticSignature): number {
  return jaccardSimilarity(tokenize(left.summary), tokenize(right.summary));
}

export function summarizeSignatureStability(draws: SignatureDraw[]) {
  const taskIds = Object.keys(draws[0].signatures);
  const perTask = taskIds.map((taskId) => {
    const labelAgreements: number[] = [];
    const labelSetSimilarities: number[] = [];
    const summarySimilarities: number[] = [];
    for (let leftIndex = 0; leftIndex < draws.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < draws.length; rightIndex += 1) {
        labelAgreements.push(
          labelSlotAgreement(
            draws[leftIndex].signatures[taskId],
            draws[rightIndex].signatures[taskId],
          ),
        );
        labelSetSimilarities.push(
          labelSetSimilarity(
            draws[leftIndex].signatures[taskId],
            draws[rightIndex].signatures[taskId],
          ),
        );
        summarySimilarities.push(
          summarySimilarity(
            draws[leftIndex].signatures[taskId],
            draws[rightIndex].signatures[taskId],
          ),
        );
      }
    }
    return {
      averageLabelSetSimilarity: mean(labelSetSimilarities),
      averageLabelSlotAgreement: mean(labelAgreements),
      averageSummarySimilarity: mean(summarySimilarities),
      taskId,
    };
  });
  return {
    averageLabelSetSimilarity: mean(perTask.map((task) => task.averageLabelSetSimilarity)),
    averageLabelSlotAgreement: mean(perTask.map((task) => task.averageLabelSlotAgreement)),
    averageSummarySimilarity: mean(perTask.map((task) => task.averageSummarySimilarity)),
    perTask,
  };
}

export function summarizeRouteStability(draws: SignatureDraw[], scope: 'holdout' | 'leaveOneOut') {
  return Object.fromEntries(
    signatureModels.map((model) => {
      const predictionMap = new Map<string, Set<string>>();
      for (const draw of draws) {
        for (const prediction of draw[scope][model].predictions) {
          const profiles = predictionMap.get(prediction.taskId) ?? new Set<string>();
          profiles.add(prediction.predictedProfile);
          predictionMap.set(prediction.taskId, profiles);
        }
      }
      const unstableTaskIds = [...predictionMap.entries()]
        .filter(([, profiles]) => profiles.size > 1)
        .map(([taskId]) => taskId);
      return [
        model,
        {
          accuracies: draws.map((draw) => draw[scope][model].accuracy),
          averageAccuracy: mean(draws.map((draw) => draw[scope][model].accuracy)),
          averageRegret: mean(draws.map((draw) => draw[scope][model].averageRegret)),
          averageUniquePredictionCount: mean(
            [...predictionMap.values()].map((profiles) => profiles.size),
          ),
          regrets: draws.map((draw) => draw[scope][model].averageRegret),
          stableTaskCount: predictionMap.size - unstableTaskIds.length,
          unstableTaskCount: unstableTaskIds.length,
          unstableTaskIds,
        },
      ];
    }),
  );
}

export async function buildSignatureDraw(
  rows: ObservedOutcomeRow[],
  providerId: string,
  trial: number,
  generateSignature = generateSemanticSignature,
): Promise<SignatureDraw> {
  const signatures = Object.fromEntries(
    await Promise.all(
      rows.map(async (row) => [row.task.id, await generateSignature(row, providerId)]),
    ),
  ) as Record<string, SemanticSignature>;
  const trainingRows = rows.filter((row) => row.task.split === 'train');
  const holdoutRows = rows.filter((row) => row.task.split === 'holdout');
  return {
    holdout: evaluateModels(trainingRows, holdoutRows, signatures),
    leaveOneOut: evaluateLeaveOneOut(rows, signatures),
    signatures,
    trial,
  };
}

async function main() {
  const [inputPath, providerId = 'openai:responses:gpt-5.4-mini', trialCountArg = '3'] =
    process.argv.slice(2);
  if (!inputPath) {
    throw new Error(
      'Usage: tsx scripts/redteam-research/evaluateRepairSemanticSignatureStability.ts <redteam.yaml> [providerId] [trialCount]',
    );
  }
  const trialCount = Number.parseInt(trialCountArg, 10);
  if (!Number.isInteger(trialCount) || trialCount < 2) {
    throw new Error(`Invalid trial count: ${trialCountArg}`);
  }
  const { accepted } = await buildValidatedRepairTaskBenchmark(inputPath);
  const observedRows = buildObservedOutcomeRows(accepted);
  const draws = [];
  for (let trial = 1; trial <= trialCount; trial += 1) {
    draws.push(await buildSignatureDraw(observedRows, providerId, trial));
  }

  console.log(
    JSON.stringify(
      {
        providerId,
        routeStability: {
          holdout: summarizeRouteStability(draws, 'holdout'),
          leaveOneOut: summarizeRouteStability(draws, 'leaveOneOut'),
        },
        signatureStability: summarizeSignatureStability(draws),
        trialSummaries: draws.map((draw) => ({
          holdout: draw.holdout,
          leaveOneOut: draw.leaveOneOut,
          trial: draw.trial,
        })),
        trialCount,
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
