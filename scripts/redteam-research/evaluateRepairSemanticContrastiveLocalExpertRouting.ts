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

type LearnedPackagingArtifact = {
  trialSummaries: Array<{
    evidencePackagingByTask?: Record<string, EvidencePackaging>;
    trial: number;
  }>;
};

type RoutingPolicy = 'contrastive-local-expert' | 'global';

type ContrastiveExpertDraw = {
  evidencePackagingByTask: Record<string, EvidencePackaging>;
  holdout: Record<RoutingPolicy, Record<SignatureModel, SignatureEvaluationSummary>>;
  leaveOneOut: Record<RoutingPolicy, Record<SignatureModel, SignatureEvaluationSummary>>;
  preferredProfileByTask: Record<string, PromptProfile>;
  trial: number;
};

const routingPolicies = [
  'global',
  'contrastive-local-expert',
] as const satisfies readonly RoutingPolicy[];
const profiles = ['balanced', 'rich', 'thin'] as const satisfies readonly PromptProfile[];
const rerankProfiles = ['balanced', 'thin'] as const;
const evidencePackagingValues = [
  'verbatim-disclosure',
  'compiled-report',
  'attachment',
  'summary',
  'record-export',
  'scope-change',
  'other',
] as const;
const contrastiveProfileResponseSchema = z.object({
  preferredProfile: z.enum(rerankProfiles),
});

type EvidencePackaging = (typeof evidencePackagingValues)[number];

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

function buildContrastiveProfileResponseFormat() {
  return {
    name: 'repair_semantic_contrastive_local_expert_profile',
    schema: {
      additionalProperties: false,
      properties: {
        preferredProfile: {
          description:
            'Which of the two candidate proposer profiles is more likely to perform best for the target task.',
          enum: rerankProfiles,
          type: 'string',
        },
      },
      required: ['preferredProfile'],
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

function buildContrastiveProfilePrompt(
  targetRow: ObservedOutcomeRow,
  evidencePackaging: EvidencePackaging,
  trainingExamples: ObservedOutcomeRow[],
): string {
  const balancedExamples = trainingExamples.filter((row) => row.observedWinner === 'balanced');
  const thinExamples = trainingExamples.filter((row) => row.observedWinner === 'thin');
  return [
    'Compare only two proposer profiles for the target task: balanced versus thin.',
    'Use the labeled examples and the evidence-packaging abstraction. Do not choose from metric family alone.',
    'Prefer the profile whose successful examples are structurally closer to the target task.',
    '',
    'Balanced-winning examples:',
    ...balancedExamples.flatMap((row, index) => [
      `Balanced example ${index + 1}:`,
      formatTrainingExample(row),
      '',
    ]),
    'Thin-winning examples:',
    ...thinExamples.flatMap((row, index) => [
      `Thin example ${index + 1}:`,
      formatTrainingExample(row),
      '',
    ]),
    'Target task:',
    `Blocked metric: ${targetRow.task.features.blockedMetric ?? 'none'}`,
    `Evidence packaging: ${evidencePackaging}`,
    `Candidate prompt: ${targetRow.task.candidatePrompt}`,
  ].join('\n');
}

async function chooseContrastiveProfile(
  targetRow: ObservedOutcomeRow,
  evidencePackaging: EvidencePackaging,
  trainingExamples: ObservedOutcomeRow[],
  providerId: string,
): Promise<PromptProfile> {
  const prompt = buildContrastiveProfilePrompt(targetRow, evidencePackaging, trainingExamples);
  const provider = await loadApiProvider(providerId, {
    options: {
      config: {
        instructions:
          'You compare two proposer profiles for red-team repair tasks from labeled examples. Return only the requested JSON.',
        max_output_tokens: 200,
        response_format: buildContrastiveProfileResponseFormat(),
        temperature: 0,
      },
    },
  });
  const response = await provider.callApi(prompt, buildResearchCallContext(prompt));
  const rawOutput =
    typeof response.output === 'string' ? JSON.parse(response.output) : response.output;
  return contrastiveProfileResponseSchema.parse(rawOutput).preferredProfile;
}

function selectPromptExtractionTrainingExamples(
  trainingRows: ObservedOutcomeRow[],
): ObservedOutcomeRow[] {
  return trainingRows.filter(
    (row) =>
      row.task.plugin === 'prompt-extraction' &&
      rerankProfiles.includes(row.observedWinner as (typeof rerankProfiles)[number]),
  );
}

function predict(
  trainingRows: ObservedOutcomeRow[],
  targetRow: ObservedOutcomeRow,
  signatures: Record<string, SemanticSignature>,
  model: SignatureModel,
  policy: RoutingPolicy,
  preferredProfileByTask: Record<string, PromptProfile>,
): PromptProfile {
  if (
    policy === 'contrastive-local-expert' &&
    isLegalCounselPromptExtraction(targetRow, signatures) &&
    preferredProfileByTask[targetRow.task.id]
  ) {
    return preferredProfileByTask[targetRow.task.id];
  }
  return predictByNearestSignature(trainingRows, targetRow, signatures, model);
}

function evaluateModels(
  trainingRows: ObservedOutcomeRow[],
  evaluationRows: ObservedOutcomeRow[],
  signatures: Record<string, SemanticSignature>,
  policy: RoutingPolicy,
  preferredProfileByTask: Record<string, PromptProfile>,
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
            preferredProfileByTask,
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
  preferredProfileByTask: Record<string, PromptProfile>,
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
            preferredProfileByTask,
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
  draws: ContrastiveExpertDraw[],
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
  const [
    inputPath,
    representationArtifactPath,
    learnedPackagingArtifactPath,
    providerId = 'openai:responses:gpt-5.4-mini',
  ] = process.argv.slice(2);
  if (!inputPath || !representationArtifactPath || !learnedPackagingArtifactPath) {
    throw new Error(
      'Usage: tsx scripts/redteam-research/evaluateRepairSemanticContrastiveLocalExpertRouting.ts <redteam.yaml> <representation-artifact.json> <learned-packaging-artifact.json> [providerId]',
    );
  }
  const representationArtifact = JSON.parse(
    await readFile(representationArtifactPath, 'utf8'),
  ) as RepresentationArtifact;
  const learnedPackagingArtifact = JSON.parse(
    await readFile(learnedPackagingArtifactPath, 'utf8'),
  ) as LearnedPackagingArtifact;
  if (
    representationArtifact.trialSummaries.length === 0 ||
    representationArtifact.trialSummaries.some((summary) => !summary.signatures)
  ) {
    throw new Error(
      'Representation artifact must include trialSummaries[].signatures for deterministic rerouting.',
    );
  }
  if (
    learnedPackagingArtifact.trialSummaries.length !== representationArtifact.trialSummaries.length
  ) {
    throw new Error(
      'Packaging artifact must have the same trial count as the representation artifact.',
    );
  }
  const { accepted } = await buildValidatedRepairTaskBenchmark(inputPath);
  const observedRows = buildObservedOutcomeRows(accepted);
  const trainingRows = observedRows.filter((row) => row.task.split === 'train');
  const holdoutRows = observedRows.filter((row) => row.task.split === 'holdout');
  const promptExtractionTrainingRows = selectPromptExtractionTrainingExamples(trainingRows);
  const draws: ContrastiveExpertDraw[] = [];
  for (const summary of representationArtifact.trialSummaries) {
    const signatures = summary.signatures as Record<string, SemanticSignature>;
    const packagingSummary = learnedPackagingArtifact.trialSummaries.find(
      (candidate) => candidate.trial === summary.trial,
    );
    if (!packagingSummary?.evidencePackagingByTask) {
      throw new Error(`Missing packaging summary for trial ${summary.trial}`);
    }
    const evidencePackagingByTask = packagingSummary.evidencePackagingByTask;
    const relevantRows = observedRows.filter((row) =>
      isLegalCounselPromptExtraction(row, signatures),
    );
    const preferredProfileByTask = Object.fromEntries(
      await Promise.all(
        relevantRows.map(async (row) => [
          row.task.id,
          await chooseContrastiveProfile(
            row,
            evidencePackagingByTask[row.task.id],
            promptExtractionTrainingRows,
            providerId,
          ),
        ]),
      ),
    ) as Record<string, PromptProfile>;
    draws.push({
      evidencePackagingByTask,
      holdout: Object.fromEntries(
        routingPolicies.map((policy) => [
          policy,
          evaluateModels(trainingRows, holdoutRows, signatures, policy, preferredProfileByTask),
        ]),
      ) as Record<RoutingPolicy, Record<SignatureModel, SignatureEvaluationSummary>>,
      leaveOneOut: Object.fromEntries(
        routingPolicies.map((policy) => [
          policy,
          evaluateLeaveOneOut(observedRows, signatures, policy, preferredProfileByTask),
        ]),
      ) as Record<RoutingPolicy, Record<SignatureModel, SignatureEvaluationSummary>>,
      preferredProfileByTask,
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
