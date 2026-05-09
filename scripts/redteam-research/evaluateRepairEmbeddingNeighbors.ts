import { loadApiProvider } from '../../src/providers';
import {
  buildObservedOutcomeRows,
  observedOutcomes,
  type ObservedOutcomeRow,
  type PromptProfile,
} from './buildRepairOutcomeTable';
import { buildValidatedRepairTaskBenchmark } from './generateRepairTaskBenchmark';

type EmbeddingPrediction = {
  actualWinner: PromptProfile;
  predictedProfile: PromptProfile;
  regret: number;
  split: ObservedOutcomeRow['task']['split'];
  taskId: string;
};
type EmbeddingEvaluationSummary = {
  accuracy: number;
  averageRegret: number;
  maxRegret: number;
  predictions: EmbeddingPrediction[];
};

const profiles = ['balanced', 'rich', 'thin'] as const;

function semanticContextText(row: ObservedOutcomeRow): string {
  return [
    row.task.plugin,
    row.task.features.blockedMetric ?? 'none',
    row.task.targetTactic,
    row.task.candidatePrompt,
    ...row.task.collisionPrompts,
  ].join('\n');
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

function summarizePredictions(
  predictions: EmbeddingPrediction[],
): EmbeddingEvaluationSummary {
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

function cosineSimilarity(left: number[], right: number[]): number {
  const numerator = left.reduce((sum, value, index) => sum + value * right[index], 0);
  const leftMagnitude = Math.sqrt(left.reduce((sum, value) => sum + value ** 2, 0));
  const rightMagnitude = Math.sqrt(right.reduce((sum, value) => sum + value ** 2, 0));
  return leftMagnitude === 0 || rightMagnitude === 0
    ? 0
    : numerator / (leftMagnitude * rightMagnitude);
}

function predictByNearestEmbedding(
  trainingRows: ObservedOutcomeRow[],
  targetRow: ObservedOutcomeRow,
  embeddings: Record<string, number[]>,
): PromptProfile {
  const targetEmbedding = embeddings[targetRow.task.id];
  const [nearestNeighbor] = [...trainingRows].sort(
    (left, right) =>
      cosineSimilarity(embeddings[right.task.id], targetEmbedding) -
      cosineSimilarity(embeddings[left.task.id], targetEmbedding),
  );
  return selectHighestYieldProfile(getTop3Yields(nearestNeighbor));
}

function evaluateModels(
  trainingRows: ObservedOutcomeRow[],
  evaluationRows: ObservedOutcomeRow[],
  embeddings: Record<string, number[]>,
): EmbeddingEvaluationSummary {
  return summarizePredictions(
    evaluationRows.map((row) => {
      const predictedProfile = predictByNearestEmbedding(trainingRows, row, embeddings);
      return {
        actualWinner: row.observedWinner,
        predictedProfile,
        regret: regretForPrediction(row, predictedProfile),
        split: row.task.split,
        taskId: row.task.id,
      };
    }),
  );
}

function evaluateLeaveOneOut(
  rows: ObservedOutcomeRow[],
  embeddings: Record<string, number[]>,
): EmbeddingEvaluationSummary {
  return summarizePredictions(
    rows.map((row) => {
      const trainingRows = rows.filter((candidate) => candidate.task.id !== row.task.id);
      const predictedProfile = predictByNearestEmbedding(trainingRows, row, embeddings);
      return {
        actualWinner: row.observedWinner,
        predictedProfile,
        regret: regretForPrediction(row, predictedProfile),
        split: row.task.split,
        taskId: row.task.id,
      };
    }),
  );
}

async function main() {
  const [inputPath, providerId = 'openai:embedding:text-embedding-3-large'] =
    process.argv.slice(2);
  if (!inputPath) {
    throw new Error(
      'Usage: tsx scripts/redteam-research/evaluateRepairEmbeddingNeighbors.ts <redteam.yaml> [providerId]',
    );
  }
  const { accepted } = await buildValidatedRepairTaskBenchmark(inputPath);
  const observedRows = buildObservedOutcomeRows(accepted);
  const provider = await loadApiProvider(providerId);
  if (!provider.callEmbeddingApi) {
    throw new Error(`Provider ${provider.id()} does not implement callEmbeddingApi`);
  }
  const embeddings = Object.fromEntries(
    await Promise.all(
      observedRows.map(async (row) => {
        const response = await provider.callEmbeddingApi?.(semanticContextText(row));
        if (!response?.embedding) {
          throw new Error(response?.error ?? `No embedding returned for ${row.task.id}`);
        }
        return [row.task.id, response.embedding];
      }),
    ),
  ) as Record<string, number[]>;
  const trainingRows = observedRows.filter((row) => row.task.split === 'train');
  const holdoutRows = observedRows.filter((row) => row.task.split === 'holdout');

  console.log(
    JSON.stringify(
      {
        embeddingDimensions: Object.values(embeddings)[0]?.length ?? 0,
        holdout: evaluateModels(trainingRows, holdoutRows, embeddings),
        leaveOneOut: evaluateLeaveOneOut(observedRows, embeddings),
        providerId,
      },
      null,
      2,
    ),
  );
}

await main();
