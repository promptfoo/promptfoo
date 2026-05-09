import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

type FrontierCandidatePrediction = {
  criticPrediction: boolean;
  expectedShouldUseLocalExpert: boolean;
  ordinaryPrediction: boolean;
  taskId: string;
};

type ActiveTransferRun = {
  frontierCandidates: Array<{
    candidatePrompt: string;
    expectedShouldUseLocalExpert: boolean;
    id: string;
    plugin: string;
    signature: {
      labels: string[];
      summary: string;
    };
  }>;
  frontierPredictions: FrontierCandidatePrediction[];
  summaries: {
    criticFailureCount: number;
    discriminativeCaseCount: number;
    ordinaryFailureCount: number;
  };
};

const batchCount = 5;
const maxBatchAttempts = 3;
const noveltyThreshold = 0.8;

function summarizePredictions(predictions: FrontierCandidatePrediction[]) {
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

function tokenize(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

function jaccardSimilarity(left: string, right: string): number {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  const union = new Set([...leftTokens, ...rightTokens]);
  if (union.size === 0) {
    return 0;
  }
  let intersectionSize = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersectionSize += 1;
    }
  }
  return intersectionSize / union.size;
}

function buildNoveltyText(candidate: ActiveTransferRun['frontierCandidates'][number]): string {
  return `${candidate.signature.summary}\n${candidate.candidatePrompt}`;
}

function summarizeRetainedNovelty(candidates: ActiveTransferRun['frontierCandidates'][number][]) {
  let maxPairwiseSimilarity = 0;
  let mostSimilarPair:
    | [
        ActiveTransferRun['frontierCandidates'][number],
        ActiveTransferRun['frontierCandidates'][number],
      ]
    | undefined;
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const similarity = jaccardSimilarity(
        buildNoveltyText(candidates[leftIndex]),
        buildNoveltyText(candidates[rightIndex]),
      );
      if (similarity > maxPairwiseSimilarity) {
        maxPairwiseSimilarity = similarity;
        mostSimilarPair = [candidates[leftIndex], candidates[rightIndex]];
      }
    }
  }
  return {
    maxPairwiseSimilarity,
    mostSimilarPair:
      mostSimilarPair?.map((candidate) => ({
        id: candidate.id,
        summary: candidate.signature.summary,
      })) ?? [],
  };
}

function runActiveTransferFrontier(): { attempts: number; result: ActiveTransferRun } {
  let lastError: unknown;
  for (let attempts = 1; attempts <= maxBatchAttempts; attempts += 1) {
    try {
      const output = execFileSync(
        process.execPath,
        ['--import', 'tsx', 'scripts/redteam-research/evaluateRepairActiveTransferFrontier.ts'],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
          env: process.env,
          maxBuffer: 20 * 1024 * 1024,
        },
      );
      return {
        attempts,
        result: JSON.parse(output) as ActiveTransferRun,
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function main() {
  const retainedPredictions = new Map<string, FrontierCandidatePrediction>();
  const retainedCandidates = new Map<string, ActiveTransferRun['frontierCandidates'][number]>();
  const batches = [];

  for (let batch = 1; batch <= batchCount; batch += 1) {
    const { attempts, result } = runActiveTransferFrontier();
    const discriminativePredictions = result.frontierPredictions.filter(
      (prediction) => prediction.ordinaryPrediction !== prediction.criticPrediction,
    );
    let duplicateDiscriminativeCaseCount = 0;
    let novelDiscriminativeCaseCount = 0;
    for (const prediction of discriminativePredictions) {
      const candidate = result.frontierCandidates.find(
        (frontierCandidate) => frontierCandidate.id === prediction.taskId,
      );
      if (!candidate) {
        throw new Error(`Missing frontier candidate for ${prediction.taskId}.`);
      }
      const noveltyText = buildNoveltyText(candidate);
      const mostSimilarRetainedCase = [...retainedCandidates.values()].reduce(
        (maximumSimilarity, retainedCandidate) =>
          Math.max(
            maximumSimilarity,
            jaccardSimilarity(noveltyText, buildNoveltyText(retainedCandidate)),
          ),
        0,
      );
      if (mostSimilarRetainedCase >= noveltyThreshold) {
        duplicateDiscriminativeCaseCount += 1;
        continue;
      }
      novelDiscriminativeCaseCount += 1;
      const retainedKey = [
        prediction.expectedShouldUseLocalExpert,
        candidate.signature.summary,
        candidate.candidatePrompt,
      ].join('|');
      retainedPredictions.set(retainedKey, prediction);
      retainedCandidates.set(retainedKey, candidate);
    }
    const retainedSummary = summarizePredictions([...retainedPredictions.values()]);
    batches.push({
      attempts,
      batch,
      batchSummary: {
        candidateCount: result.frontierPredictions.length,
        criticFailureCount: result.summaries.criticFailureCount,
        discriminativeCaseCount: result.summaries.discriminativeCaseCount,
        ordinaryFailureCount: result.summaries.ordinaryFailureCount,
      },
      duplicateDiscriminativeCaseCount,
      novelDiscriminativeCaseCount,
      retainedSummary,
    });
  }

  console.log(
    JSON.stringify(
      {
        batchCount,
        batches,
        maxBatchAttempts,
        noveltyThreshold,
        retainedCandidates: [...retainedCandidates.values()],
        retainedNovelty: summarizeRetainedNovelty([...retainedCandidates.values()]),
        retainedPredictions: [...retainedPredictions.values()],
        retainedSummary: summarizePredictions([...retainedPredictions.values()]),
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
