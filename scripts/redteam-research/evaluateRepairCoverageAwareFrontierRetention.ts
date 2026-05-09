import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { loadApiProvider } from '../../src/providers';

type FrontierCandidate = {
  candidatePrompt: string;
  expectedShouldUseLocalExpert: boolean;
  id: string;
  plugin: string;
  signature: {
    labels: string[];
    summary: string;
  };
};

type FrontierCandidatePrediction = {
  criticPrediction: boolean;
  expectedShouldUseLocalExpert: boolean;
  ordinaryPrediction: boolean;
  taskId: string;
};

type RetainedTransferFrontierRun = {
  retainedCandidates: FrontierCandidate[];
  retainedPredictions: FrontierCandidatePrediction[];
};

type FailureMode = 'critic-only' | 'ordinary-only';

type ReplaySummary = {
  candidateCount: number;
  criticFailureCount: number;
  discriminativeCaseCount: number;
  ordinaryFailureCount: number;
};

const defaultThreshold = 0.75;
const replayCount = 100;

function buildNoveltyText(candidate: FrontierCandidate): string {
  return `${candidate.signature.summary}\n${candidate.candidatePrompt}`;
}

function cosineSimilarity(left: number[], right: number[]): number {
  const numerator = left.reduce((sum, value, index) => sum + value * right[index], 0);
  const leftMagnitude = Math.sqrt(left.reduce((sum, value) => sum + value ** 2, 0));
  const rightMagnitude = Math.sqrt(right.reduce((sum, value) => sum + value ** 2, 0));
  return leftMagnitude === 0 || rightMagnitude === 0
    ? 0
    : numerator / (leftMagnitude * rightMagnitude);
}

function getFailureMode(prediction: FrontierCandidatePrediction): FailureMode {
  const ordinaryFails =
    prediction.ordinaryPrediction !== prediction.expectedShouldUseLocalExpert;
  const criticFails = prediction.criticPrediction !== prediction.expectedShouldUseLocalExpert;
  if (ordinaryFails === criticFails) {
    throw new Error(`Expected discriminative prediction, got ${prediction.taskId}.`);
  }
  return ordinaryFails ? 'ordinary-only' : 'critic-only';
}

function summarizePredictions(predictions: FrontierCandidatePrediction[]): ReplaySummary {
  return {
    candidateCount: predictions.length,
    criticFailureCount: predictions.filter(
      (prediction) => prediction.criticPrediction !== prediction.expectedShouldUseLocalExpert,
    ).length,
    discriminativeCaseCount: predictions.filter(
      (prediction) => prediction.ordinaryPrediction !== prediction.criticPrediction,
    ).length,
    ordinaryFailureCount: predictions.filter(
      (prediction) => prediction.ordinaryPrediction !== prediction.expectedShouldUseLocalExpert,
    ).length,
  };
}

function createSeededRandom(seed: number) {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleIndexes(length: number, seed: number): number[] {
  const indexes = Array.from({ length }, (_, index) => index);
  const random = createSeededRandom(seed);
  for (let index = indexes.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [indexes[index], indexes[swapIndex]] = [indexes[swapIndex], indexes[index]];
  }
  return indexes;
}

function replayGreedyRetention({
  embeddings,
  predictions,
  order,
  threshold,
}: {
  embeddings: number[][];
  predictions: FrontierCandidatePrediction[];
  order: number[];
  threshold: number;
}) {
  const retainedIndexes: number[] = [];
  for (const candidateIndex of order) {
    const mostSimilarRetainedCase = retainedIndexes.reduce(
      (maximumSimilarity, retainedIndex) =>
        Math.max(
          maximumSimilarity,
          cosineSimilarity(embeddings[candidateIndex], embeddings[retainedIndex]),
        ),
      0,
    );
    if (mostSimilarRetainedCase < threshold) {
      retainedIndexes.push(candidateIndex);
    }
  }
  return summarizePredictions(retainedIndexes.map((index) => predictions[index]));
}

function replayCoverageAwareRetention({
  embeddings,
  predictions,
  order,
  threshold,
}: {
  embeddings: number[][];
  predictions: FrontierCandidatePrediction[];
  order: number[];
  threshold: number;
}) {
  const retainedIndexes: number[] = [];
  for (const candidateIndex of order) {
    const failureMode = getFailureMode(predictions[candidateIndex]);
    const mostSimilarRetainedCase = retainedIndexes
      .filter((retainedIndex) => getFailureMode(predictions[retainedIndex]) === failureMode)
      .reduce(
        (maximumSimilarity, retainedIndex) =>
          Math.max(
            maximumSimilarity,
            cosineSimilarity(embeddings[candidateIndex], embeddings[retainedIndex]),
          ),
        0,
      );
    if (mostSimilarRetainedCase < threshold) {
      retainedIndexes.push(candidateIndex);
    }
  }
  return summarizePredictions(retainedIndexes.map((index) => predictions[index]));
}

function buildHistogram(values: number[]) {
  return Object.fromEntries(
    [...new Set(values)]
      .sort((left, right) => left - right)
      .map((value) => [value, values.filter((candidate) => candidate === value).length]),
  );
}

function summarizeReplays({
  expectedCriticFailureCount,
  replays,
}: {
  expectedCriticFailureCount: number;
  replays: ReplaySummary[];
}) {
  return {
    criticFailureHistogram: buildHistogram(replays.map((replay) => replay.criticFailureCount)),
    criticFailureRange: {
      maximum: Math.max(...replays.map((replay) => replay.criticFailureCount)),
      minimum: Math.min(...replays.map((replay) => replay.criticFailureCount)),
    },
    fullCriticCoverageReplayCount: replays.filter(
      (replay) => replay.criticFailureCount === expectedCriticFailureCount,
    ).length,
    frontierSizeHistogram: buildHistogram(replays.map((replay) => replay.candidateCount)),
    frontierSizeRange: {
      maximum: Math.max(...replays.map((replay) => replay.candidateCount)),
      minimum: Math.min(...replays.map((replay) => replay.candidateCount)),
    },
    ordinaryFailureRange: {
      maximum: Math.max(...replays.map((replay) => replay.ordinaryFailureCount)),
      minimum: Math.min(...replays.map((replay) => replay.ordinaryFailureCount)),
    },
    replayCount: replays.length,
  };
}

async function main() {
  const [
    inputPath,
    embeddingProviderId = 'openai:embedding:text-embedding-3-large',
    thresholdValue = String(defaultThreshold),
  ] = process.argv.slice(2);
  if (!inputPath) {
    throw new Error(
      'Usage: tsx scripts/redteam-research/evaluateRepairCoverageAwareFrontierRetention.ts <retained-frontier.json> [providerId] [threshold]',
    );
  }
  const threshold = Number.parseFloat(thresholdValue);
  const input = JSON.parse(
    await fs.readFile(inputPath, 'utf8'),
  ) as RetainedTransferFrontierRun;
  const embeddingProvider = await loadApiProvider(embeddingProviderId);
  if (!embeddingProvider.callEmbeddingApi) {
    throw new Error(`Provider ${embeddingProvider.id()} does not implement callEmbeddingApi`);
  }
  const { callEmbeddingApi } = embeddingProvider;
  const embeddings = await Promise.all(
    input.retainedCandidates.map(async (candidate) => {
      const response = await callEmbeddingApi(buildNoveltyText(candidate));
      if (!response?.embedding) {
        throw new Error(response?.error ?? `No embedding returned for ${candidate.id}`);
      }
      return response.embedding;
    }),
  );
  const greedyReplays = [];
  const coverageAwareReplays = [];
  const inputSummary = summarizePredictions(input.retainedPredictions);
  for (let replay = 0; replay < replayCount; replay += 1) {
    const order = shuffleIndexes(input.retainedCandidates.length, replay + 1);
    greedyReplays.push(
      replayGreedyRetention({
        embeddings,
        order,
        predictions: input.retainedPredictions,
        threshold,
      }),
    );
    coverageAwareReplays.push(
      replayCoverageAwareRetention({
        embeddings,
        order,
        predictions: input.retainedPredictions,
        threshold,
      }),
    );
  }

  console.log(
    JSON.stringify(
      {
        embeddingProviderId,
        greedy: summarizeReplays({
          expectedCriticFailureCount: inputSummary.criticFailureCount,
          replays: greedyReplays,
        }),
        inputSummary,
        coverageAware: summarizeReplays({
          expectedCriticFailureCount: inputSummary.criticFailureCount,
          replays: coverageAwareReplays,
        }),
        replayCount,
        threshold,
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
