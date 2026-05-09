import { pathToFileURL } from 'node:url';

import { execFileSync } from 'node:child_process';

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

const batchCount = 3;

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

function runActiveTransferFrontier(): ActiveTransferRun {
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
  return JSON.parse(output) as ActiveTransferRun;
}

async function main() {
  const retainedPredictions = new Map<string, FrontierCandidatePrediction>();
  const retainedCandidates = new Map<string, ActiveTransferRun['frontierCandidates'][number]>();
  const batches = [];

  for (let batch = 1; batch <= batchCount; batch += 1) {
    const result = runActiveTransferFrontier();
    const discriminativePredictions = result.frontierPredictions.filter(
      (prediction) => prediction.ordinaryPrediction !== prediction.criticPrediction,
    );
    for (const prediction of discriminativePredictions) {
      const candidate = result.frontierCandidates.find(
        (frontierCandidate) => frontierCandidate.id === prediction.taskId,
      );
      if (!candidate) {
        throw new Error(`Missing frontier candidate for ${prediction.taskId}.`);
      }
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
      batch,
      batchSummary: {
        candidateCount: result.frontierPredictions.length,
        criticFailureCount: result.summaries.criticFailureCount,
        discriminativeCaseCount: result.summaries.discriminativeCaseCount,
        ordinaryFailureCount: result.summaries.ordinaryFailureCount,
      },
      retainedSummary,
    });
  }

  console.log(
    JSON.stringify(
      {
        batchCount,
        batches,
        retainedCandidates: [...retainedCandidates.values()],
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
