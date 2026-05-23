import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

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

const semanticAxisPatterns = {
  authority: /\bauthority\b/i,
  classification: /\bclassif(?:y|ication)\b/i,
  disclosure: /\bdisclos(?:e|ure)\b/i,
  escalation: /\bescalat(?:e|ion)\b/i,
  exceptionHandling: /\bexception\b/i,
  refusal: /\brefus(?:al|e)\b/i,
  routing: /\brout(?:e|ing)\b/i,
};

function getFailureMode(prediction: FrontierCandidatePrediction): FailureMode {
  const ordinaryFails =
    prediction.ordinaryPrediction !== prediction.expectedShouldUseLocalExpert;
  const criticFails = prediction.criticPrediction !== prediction.expectedShouldUseLocalExpert;
  if (ordinaryFails === criticFails) {
    throw new Error(`Expected discriminative prediction, got ${prediction.taskId}.`);
  }
  return ordinaryFails ? 'ordinary-only' : 'critic-only';
}

function getText(candidate: FrontierCandidate): string {
  return `${candidate.signature.summary}\n${candidate.candidatePrompt}`;
}

function getSemanticAxes(candidate: FrontierCandidate): string[] {
  const text = getText(candidate);
  return Object.entries(semanticAxisPatterns)
    .filter(([, pattern]) => pattern.test(text))
    .map(([axis]) => axis);
}

function buildHistogram(values: string[]) {
  return Object.fromEntries(
    [...new Set(values)]
      .sort()
      .map((value) => [value, values.filter((candidate) => candidate === value).length]),
  );
}

function countDistinct(values: string[]) {
  return new Set(values).size;
}

async function main() {
  const [inputPath] = process.argv.slice(2);
  if (!inputPath) {
    throw new Error(
      'Usage: tsx scripts/redteam-research/evaluateRepairMultiAxisFrontierRetention.ts <retained-frontier.json>',
    );
  }
  const input = JSON.parse(
    await fs.readFile(inputPath, 'utf8'),
  ) as RetainedTransferFrontierRun;
  const rows = input.retainedCandidates.map((candidate, index) => {
    const prediction = input.retainedPredictions[index];
    return {
      failureMode: getFailureMode(prediction),
      plugin: candidate.plugin,
      semanticAxes: getSemanticAxes(candidate),
      typedLabelCell: candidate.signature.labels.join('|'),
    };
  });
  const typedCells = rows.map((row) =>
    [row.failureMode, row.plugin, row.typedLabelCell].join('|'),
  );
  const inferredSemanticCells = rows.map((row) =>
    [row.failureMode, ...row.semanticAxes].join('|'),
  );
  console.log(
    JSON.stringify(
      {
        failureModeHistogram: buildHistogram(rows.map((row) => row.failureMode)),
        inferredSemanticAxisHistogram: buildHistogram(rows.flatMap((row) => row.semanticAxes)),
        inferredSemanticCellCount: countDistinct(inferredSemanticCells),
        inferredSemanticCellHistogram: buildHistogram(inferredSemanticCells),
        pluginHistogram: buildHistogram(rows.map((row) => row.plugin)),
        typedLabelCellCount: countDistinct(typedCells),
        typedLabelCellHistogram: buildHistogram(typedCells),
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
