import { pathToFileURL } from 'node:url';

import { z } from 'zod';
import { loadApiProvider } from '../../src/providers';
import {
  buildObservedOutcomeRows,
  type ObservedOutcomeRow,
  observedOutcomes,
  type PromptProfile,
} from './buildRepairOutcomeTable';
import { buildValidatedRepairTaskBenchmark } from './generateRepairTaskBenchmark';
import { buildResearchCallContext } from './portfolioResearchShared';
import { jaccardSimilarity, tokenize } from './sqlResearchShared';

export type SignatureModel =
  | 'label-1nn-yield'
  | 'slot-match-1nn-yield'
  | 'slot-plugin-1nn-yield'
  | 'summary-1nn-yield'
  | 'weighted-slot-1nn-yield';
export type SignaturePrediction = {
  actualWinner: PromptProfile;
  predictedProfile: PromptProfile;
  regret: number;
  split: ObservedOutcomeRow['task']['split'];
  taskId: string;
};
export type SignatureEvaluationSummary = {
  accuracy: number;
  averageRegret: number;
  maxRegret: number;
  predictions: SignaturePrediction[];
};
export const signatureModels = [
  'label-1nn-yield',
  'slot-match-1nn-yield',
  'weighted-slot-1nn-yield',
  'slot-plugin-1nn-yield',
  'summary-1nn-yield',
] as const satisfies readonly SignatureModel[];

const profiles = ['balanced', 'rich', 'thin'] as const;
const signatureResponseSchema = z.object({
  labels: z.array(z.string().min(1)).length(5),
  summary: z.string().min(1),
});
export type SemanticSignature = z.infer<typeof signatureResponseSchema>;

function buildSignatureResponseFormat() {
  return {
    name: 'repair_semantic_signature',
    schema: {
      additionalProperties: false,
      properties: {
        labels: {
          description:
            'Five short lowercase hyphenated labels capturing boundary, goal, requested action, social frame, and target resource.',
          items: { type: 'string' },
          maxItems: 5,
          minItems: 5,
          type: 'array',
        },
        summary: {
          description:
            'One concise sentence that abstracts the task without copying exact names or identifiers.',
          type: 'string',
        },
      },
      required: ['labels', 'summary'],
      type: 'object',
    },
    type: 'json_schema',
  };
}

function buildSignaturePrompt(row: ObservedOutcomeRow): string {
  return [
    'Create an outcome-blind semantic signature for this red-team repair task.',
    'Use machine-comparable lowercase hyphenated labels.',
    'Do not infer or mention which proposer profile might work best.',
    '',
    `Plugin: ${row.task.plugin}`,
    `Blocked metric: ${row.task.features.blockedMetric ?? 'none'}`,
    `Target tactic: ${row.task.targetTactic}`,
    `Candidate prompt: ${row.task.candidatePrompt}`,
    'Closest winner prompts:',
    ...row.task.collisionPrompts.map((prompt, index) => `${index + 1}. ${prompt}`),
    '',
    'Return exactly five labels in this order:',
    '1. protected boundary',
    '2. attacker goal',
    '3. requested action',
    '4. social frame',
    '5. target resource',
  ].join('\n');
}

export async function generateSemanticSignature(
  row: ObservedOutcomeRow,
  providerId: string,
): Promise<SemanticSignature> {
  const prompt = buildSignaturePrompt(row);
  const provider = await loadApiProvider(providerId, {
    options: {
      config: {
        instructions:
          'You extract compact semantic signatures for red-team tasks. Return only the requested JSON.',
        max_output_tokens: 500,
        response_format: buildSignatureResponseFormat(),
        temperature: 0,
      },
    },
  });
  const response = await provider.callApi(prompt, buildResearchCallContext(prompt));
  const rawOutput =
    typeof response.output === 'string' ? JSON.parse(response.output) : response.output;
  return signatureResponseSchema.parse(rawOutput);
}

function selectHighestYieldProfile(yields: Record<PromptProfile, number>): PromptProfile {
  return [...profiles].sort((left, right) => yields[right] - yields[left])[0];
}

function getTop3Yields(row: ObservedOutcomeRow): Record<PromptProfile, number> {
  return observedOutcomes[row.task.id].top3YieldByProfile;
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

function signatureText(signature: SemanticSignature, model: SignatureModel): string {
  return model === 'label-1nn-yield' ? signature.labels.join(' ') : signature.summary;
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
    (score, label, index) => score + (label === right.labels[index] ? weights[index] : 0),
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
        tokenize(signatureText(leftSignature, model)),
        tokenize(signatureText(rightSignature, model)),
      );
    case 'slot-match-1nn-yield':
      return slotMatchSimilarity(leftSignature, rightSignature);
    case 'slot-plugin-1nn-yield':
      return (
        slotMatchSimilarity(leftSignature, rightSignature) +
        (leftRow.task.plugin === rightRow.task.plugin ? 1 : 0)
      );
    case 'summary-1nn-yield':
      return jaccardSimilarity(
        tokenize(signatureText(leftSignature, model)),
        tokenize(signatureText(rightSignature, model)),
      );
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

export function evaluateModels(
  trainingRows: ObservedOutcomeRow[],
  evaluationRows: ObservedOutcomeRow[],
  signatures: Record<string, SemanticSignature>,
): Record<SignatureModel, SignatureEvaluationSummary> {
  return Object.fromEntries(
    signatureModels.map((model) => [
      model,
      summarizePredictions(
        evaluationRows.map((row) => {
          const predictedProfile = predictByNearestSignature(trainingRows, row, signatures, model);
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

export function evaluateLeaveOneOut(
  rows: ObservedOutcomeRow[],
  signatures: Record<string, SemanticSignature>,
): Record<SignatureModel, SignatureEvaluationSummary> {
  return Object.fromEntries(
    signatureModels.map((model) => [
      model,
      summarizePredictions(
        rows.map((row) => {
          const trainingRows = rows.filter((candidate) => candidate.task.id !== row.task.id);
          const predictedProfile = predictByNearestSignature(trainingRows, row, signatures, model);
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

async function main() {
  const [inputPath, providerId = 'openai:responses:gpt-5.4-mini'] = process.argv.slice(2);
  if (!inputPath) {
    throw new Error(
      'Usage: tsx scripts/redteam-research/evaluateRepairSemanticSignatures.ts <redteam.yaml> [providerId]',
    );
  }
  const { accepted } = await buildValidatedRepairTaskBenchmark(inputPath);
  const observedRows = buildObservedOutcomeRows(accepted);
  const signatures = Object.fromEntries(
    await Promise.all(
      observedRows.map(async (row) => [
        row.task.id,
        await generateSemanticSignature(row, providerId),
      ]),
    ),
  ) as Record<string, SemanticSignature>;
  const trainingRows = observedRows.filter((row) => row.task.split === 'train');
  const holdoutRows = observedRows.filter((row) => row.task.split === 'holdout');

  console.log(
    JSON.stringify(
      {
        holdout: evaluateModels(trainingRows, holdoutRows, signatures),
        leaveOneOut: evaluateLeaveOneOut(observedRows, signatures),
        providerId,
        signatures,
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
