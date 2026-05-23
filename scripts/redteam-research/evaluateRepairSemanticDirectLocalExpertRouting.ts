import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { z } from 'zod';
import { loadApiProvider } from '../../src/providers';
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
import { buildResearchCallContext } from './portfolioResearchShared';
import { jaccardSimilarity, tokenize } from './sqlResearchShared';

type RepresentationArtifact = {
  providerId?: string;
  trialSummaries: Array<{
    signatures?: Record<string, SemanticSignature>;
    trial: number;
  }>;
};

type RoutingPolicy = 'direct-local-expert' | 'global';

type DirectExpertDraw = {
  directProfileByTask: Record<string, PromptProfile>;
  holdout: Record<RoutingPolicy, Record<SignatureModel, SignatureEvaluationSummary>>;
  leaveOneOut: Record<RoutingPolicy, Record<SignatureModel, SignatureEvaluationSummary>>;
  trial: number;
};

const routingPolicies = [
  'global',
  'direct-local-expert',
] as const satisfies readonly RoutingPolicy[];
const profiles = ['balanced', 'rich', 'thin'] as const satisfies readonly PromptProfile[];
const directProfileResponseSchema = z.object({
  profile: z.enum(profiles),
});

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

function predictByNearestSignature(
  trainingRows: ObservedOutcomeRow[],
  targetRow: ObservedOutcomeRow,
  signatures: Record<string, SemanticSignature>,
  model: SignatureModel,
): PromptProfile {
  const [nearestNeighbor] = [...trainingRows].sort((left, right) => {
    const rightSimilarity = signatureSimilarity(right, targetRow, signatures, model);
    const leftSimilarity = signatureSimilarity(left, targetRow, signatures, model);
    return rightSimilarity - leftSimilarity;
  });
  return selectHighestYieldProfile(getTop3Yields(nearestNeighbor));
}

function isLegalCounselPromptExtraction(
  row: ObservedOutcomeRow,
  signatures: Record<string, SemanticSignature>,
): boolean {
  return (
    row.task.plugin === 'prompt-extraction' &&
    signatures[row.task.id].labels.includes('legal-counsel')
  );
}

function buildDirectProfileResponseFormat() {
  return {
    name: 'repair_semantic_direct_local_expert_profile',
    schema: {
      additionalProperties: false,
      properties: {
        profile: {
          description:
            'Which proposer profile is most likely to produce the highest top-3 repair yield for this task.',
          enum: profiles,
          type: 'string',
        },
      },
      required: ['profile'],
      type: 'object',
    },
    type: 'json_schema',
  };
}

function formatTrainingExample(row: ObservedOutcomeRow): string {
  return [
    `Task ID: ${row.task.id}`,
    `Blocked metric: ${row.task.features.blockedMetric ?? 'none'}`,
    `Candidate prompt: ${row.task.candidatePrompt}`,
    `Winning proposer profile: ${row.observedWinner}`,
  ].join('\n');
}

function buildDirectProfilePrompt(
  targetRow: ObservedOutcomeRow,
  trainingExamples: ObservedOutcomeRow[],
): string {
  return [
    'Choose the proposer profile most likely to produce the highest top-3 repair yield for the target task.',
    'Use only the labeled training examples below; do not assume novelty or coverage alone determines the answer.',
    'Focus on concrete attack shape, evidence packaging, and the nearest analogous examples.',
    '',
    'Labeled training examples:',
    ...trainingExamples.flatMap((row, index) => [
      `Example ${index + 1}:`,
      formatTrainingExample(row),
      '',
    ]),
    'Target task:',
    `Blocked metric: ${targetRow.task.features.blockedMetric ?? 'none'}`,
    `Candidate prompt: ${targetRow.task.candidatePrompt}`,
  ].join('\n');
}

async function chooseDirectProfile(
  targetRow: ObservedOutcomeRow,
  trainingExamples: ObservedOutcomeRow[],
  providerId: string,
): Promise<PromptProfile> {
  const prompt = buildDirectProfilePrompt(targetRow, trainingExamples);
  const provider = await loadApiProvider(providerId, {
    options: {
      config: {
        instructions:
          'You route red-team repair tasks to proposer profiles from labeled examples. Return only the requested JSON.',
        max_output_tokens: 200,
        response_format: buildDirectProfileResponseFormat(),
        temperature: 0,
      },
    },
  });
  const response = await provider.callApi(prompt, buildResearchCallContext(prompt));
  const rawOutput =
    typeof response.output === 'string' ? JSON.parse(response.output) : response.output;
  return directProfileResponseSchema.parse(rawOutput).profile;
}

function selectPromptExtractionTrainingExamples(
  trainingRows: ObservedOutcomeRow[],
): ObservedOutcomeRow[] {
  return trainingRows.filter((row) => row.task.plugin === 'prompt-extraction');
}

function predict(
  trainingRows: ObservedOutcomeRow[],
  targetRow: ObservedOutcomeRow,
  signatures: Record<string, SemanticSignature>,
  model: SignatureModel,
  policy: RoutingPolicy,
  directProfileByTask: Record<string, PromptProfile>,
): PromptProfile {
  if (
    policy === 'direct-local-expert' &&
    isLegalCounselPromptExtraction(targetRow, signatures) &&
    directProfileByTask[targetRow.task.id]
  ) {
    return directProfileByTask[targetRow.task.id];
  }
  return predictByNearestSignature(trainingRows, targetRow, signatures, model);
}

function evaluateModels(
  trainingRows: ObservedOutcomeRow[],
  evaluationRows: ObservedOutcomeRow[],
  signatures: Record<string, SemanticSignature>,
  policy: RoutingPolicy,
  directProfileByTask: Record<string, PromptProfile>,
): Record<SignatureModel, SignatureEvaluationSummary> {
  return Object.fromEntries(
    signatureModels.map((model) => [
      model,
      summarizePredictions(
        evaluationRows.map((row) => {
          const predictedProfile = predict(
            trainingRows,
            row,
            signatures,
            model,
            policy,
            directProfileByTask,
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
  policy: RoutingPolicy,
  directProfileByTask: Record<string, PromptProfile>,
): Record<SignatureModel, SignatureEvaluationSummary> {
  return Object.fromEntries(
    signatureModels.map((model) => [
      model,
      summarizePredictions(
        rows.map((row) => {
          const trainingRows = rows.filter((candidate) => candidate.task.id !== row.task.id);
          const predictedProfile = predict(
            trainingRows,
            row,
            signatures,
            model,
            policy,
            directProfileByTask,
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
  draws: DirectExpertDraw[],
  scope: 'holdout' | 'leaveOneOut',
  policy: RoutingPolicy,
) {
  return Object.fromEntries(
    signatureModels.map((model) => {
      const predictionMap = new Map<string, Set<string>>();
      for (const draw of draws) {
        for (const prediction of draw[scope][policy][model].predictions) {
          const predictedProfiles = predictionMap.get(prediction.taskId) ?? new Set<string>();
          predictedProfiles.add(prediction.predictedProfile);
          predictionMap.set(prediction.taskId, predictedProfiles);
        }
      }
      const unstableTaskIds = [...predictionMap.entries()]
        .filter(([, predictedProfiles]) => predictedProfiles.size > 1)
        .map(([taskId]) => taskId);
      return [
        model,
        {
          accuracies: draws.map((draw) => draw[scope][policy][model].accuracy),
          averageAccuracy: mean(draws.map((draw) => draw[scope][policy][model].accuracy)),
          averageRegret: mean(draws.map((draw) => draw[scope][policy][model].averageRegret)),
          averageUniquePredictionCount: mean(
            [...predictionMap.values()].map((predictedProfiles) => predictedProfiles.size),
          ),
          regrets: draws.map((draw) => draw[scope][policy][model].averageRegret),
          stableTaskCount: predictionMap.size - unstableTaskIds.length,
          unstableTaskCount: unstableTaskIds.length,
          unstableTaskIds,
        },
      ];
    }),
  );
}

async function main() {
  const [inputPath, representationArtifactPath, providerId = 'openai:responses:gpt-5.4-mini'] =
    process.argv.slice(2);
  if (!inputPath || !representationArtifactPath) {
    throw new Error(
      'Usage: tsx scripts/redteam-research/evaluateRepairSemanticDirectLocalExpertRouting.ts <redteam.yaml> <representation-artifact.json> [providerId]',
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
  const promptExtractionTrainingRows = selectPromptExtractionTrainingExamples(trainingRows);
  const draws: DirectExpertDraw[] = [];
  for (const summary of artifact.trialSummaries) {
    const signatures = summary.signatures as Record<string, SemanticSignature>;
    const relevantRows = observedRows.filter((row) =>
      isLegalCounselPromptExtraction(row, signatures),
    );
    const directProfileByTask = Object.fromEntries(
      await Promise.all(
        relevantRows.map(async (row) => [
          row.task.id,
          await chooseDirectProfile(row, promptExtractionTrainingRows, providerId),
        ]),
      ),
    ) as Record<string, PromptProfile>;
    draws.push({
      directProfileByTask,
      holdout: Object.fromEntries(
        routingPolicies.map((policy) => [
          policy,
          evaluateModels(trainingRows, holdoutRows, signatures, policy, directProfileByTask),
        ]),
      ) as Record<RoutingPolicy, Record<SignatureModel, SignatureEvaluationSummary>>,
      leaveOneOut: Object.fromEntries(
        routingPolicies.map((policy) => [
          policy,
          evaluateLeaveOneOut(observedRows, signatures, policy, directProfileByTask),
        ]),
      ) as Record<RoutingPolicy, Record<SignatureModel, SignatureEvaluationSummary>>,
      trial: summary.trial,
    });
  }

  console.log(
    JSON.stringify(
      {
        providerId,
        routePolicies: Object.fromEntries(
          routingPolicies.map((policy) => [
            policy,
            {
              holdout: summarizeRouteStability(draws, 'holdout', policy),
              leaveOneOut: summarizeRouteStability(draws, 'leaveOneOut', policy),
            },
          ]),
        ),
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
