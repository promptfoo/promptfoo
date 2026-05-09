import {
  buildObservedOutcomeRows,
  metricFamilyRouter,
  observedOutcomes,
  type ObservedOutcomeRow,
  type PromptProfile,
} from './buildRepairOutcomeTable';
import { buildValidatedRepairTaskBenchmark } from './generateRepairTaskBenchmark';

type ModelName =
  | 'family-mean-yield'
  | 'global-mean-yield'
  | 'metric-family-router'
  | 'plugin-mean-yield'
  | 'ridge-yield';
type Prediction = {
  actualWinner: PromptProfile;
  predictedProfile: PromptProfile;
  regret: number;
  split: ObservedOutcomeRow['task']['split'];
  taskId: string;
};
type EvaluationSummary = {
  accuracy: number;
  averageRegret: number;
  maxRegret: number;
  predictions: Prediction[];
};

const profiles = ['balanced', 'rich', 'thin'] as const;
const featureNames = [
  'coverageFamily',
  'cleanSameSlotReplacement',
  'displacedSlotCount',
  'residualGapToBeat',
  'averageCollisionSimilarity',
  'maxCollisionSimilarity',
] as const;
const ridgeLambda = 0.1;

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

function summarizePredictions(predictions: Prediction[]): EvaluationSummary {
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

function averageYields(rows: ObservedOutcomeRow[]): Record<PromptProfile, number> {
  return Object.fromEntries(
    profiles.map((profile) => [
      profile,
      rows.reduce((sum, row) => sum + getTop3Yields(row)[profile], 0) / rows.length,
    ]),
  ) as Record<PromptProfile, number>;
}

function predictByGroupedMean(
  trainingRows: ObservedOutcomeRow[],
  targetRow: ObservedOutcomeRow,
  groupOf: (row: ObservedOutcomeRow) => string,
): PromptProfile {
  const matchingRows = trainingRows.filter((row) => groupOf(row) === groupOf(targetRow));
  const rowsForPrediction = matchingRows.length > 0 ? matchingRows : trainingRows;
  return selectHighestYieldProfile(averageYields(rowsForPrediction));
}

function featureVector(row: ObservedOutcomeRow): number[] {
  return [
    row.task.features.blockedMetricFamily === 'coverage' ? 1 : 0,
    row.task.features.cleanSameSlotReplacement ? 1 : 0,
    row.task.features.displacedSlotCount,
    row.task.features.residualGapToBeat,
    row.task.features.averageCollisionSimilarity,
    row.task.features.maxCollisionSimilarity,
  ];
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardizeFeatureMatrix(rows: ObservedOutcomeRow[], targetRow: ObservedOutcomeRow) {
  const trainingVectors = rows.map(featureVector);
  const targetVector = featureVector(targetRow);
  const means = featureNames.map((_, index) => mean(trainingVectors.map((vector) => vector[index])));
  const standardDeviations = featureNames.map((_, index) => {
    const variance = mean(
      trainingVectors.map((vector) => (vector[index] - means[index]) ** 2),
    );
    return variance === 0 ? 1 : Math.sqrt(variance);
  });
  const normalize = (vector: number[]) =>
    vector.map((value, index) => (value - means[index]) / standardDeviations[index]);
  return {
    targetVector: normalize(targetVector),
    trainingVectors: trainingVectors.map(normalize),
  };
}

function transpose(matrix: number[][]): number[][] {
  return matrix[0].map((_, columnIndex) => matrix.map((row) => row[columnIndex]));
}

function multiply(left: number[][], right: number[][]): number[][] {
  return left.map((leftRow) =>
    right[0].map((_, columnIndex) =>
      leftRow.reduce((sum, value, rowIndex) => sum + value * right[rowIndex][columnIndex], 0),
    ),
  );
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] {
  const augmented = matrix.map((row, index) => [...row, vector[index]]);

  for (let pivotIndex = 0; pivotIndex < augmented.length; pivotIndex += 1) {
    let maxRow = pivotIndex;
    for (let rowIndex = pivotIndex + 1; rowIndex < augmented.length; rowIndex += 1) {
      if (Math.abs(augmented[rowIndex][pivotIndex]) > Math.abs(augmented[maxRow][pivotIndex])) {
        maxRow = rowIndex;
      }
    }
    [augmented[pivotIndex], augmented[maxRow]] = [augmented[maxRow], augmented[pivotIndex]];

    const pivot = augmented[pivotIndex][pivotIndex];
    if (Math.abs(pivot) < Number.EPSILON) {
      throw new Error('Unable to solve singular regression system');
    }
    for (let columnIndex = pivotIndex; columnIndex < augmented[pivotIndex].length; columnIndex += 1) {
      augmented[pivotIndex][columnIndex] /= pivot;
    }
    for (let rowIndex = 0; rowIndex < augmented.length; rowIndex += 1) {
      if (rowIndex === pivotIndex) {
        continue;
      }
      const factor = augmented[rowIndex][pivotIndex];
      for (let columnIndex = pivotIndex; columnIndex < augmented[rowIndex].length; columnIndex += 1) {
        augmented[rowIndex][columnIndex] -= factor * augmented[pivotIndex][columnIndex];
      }
    }
  }

  return augmented.map((row) => row[row.length - 1]);
}

function fitRidgePredictor(
  trainingRows: ObservedOutcomeRow[],
  targetRow: ObservedOutcomeRow,
  profile: PromptProfile,
): number {
  const { targetVector, trainingVectors } = standardizeFeatureMatrix(trainingRows, targetRow);
  const designMatrix = trainingVectors.map((vector) => [1, ...vector]);
  const targetDesignVector = [1, ...targetVector];
  const transposed = transpose(designMatrix);
  const normalMatrix = multiply(transposed, designMatrix);
  for (let index = 1; index < normalMatrix.length; index += 1) {
    normalMatrix[index][index] += ridgeLambda;
  }
  const observedYields = trainingRows.map((row) => getTop3Yields(row)[profile]);
  const rightHandSide = transposed.map((row) =>
    row.reduce((sum, value, index) => sum + value * observedYields[index], 0),
  );
  const coefficients = solveLinearSystem(normalMatrix, rightHandSide);
  return coefficients.reduce(
    (sum, coefficient, index) => sum + coefficient * targetDesignVector[index],
    0,
  );
}

function predictWithRidge(
  trainingRows: ObservedOutcomeRow[],
  targetRow: ObservedOutcomeRow,
): PromptProfile {
  const predictedYields = Object.fromEntries(
    profiles.map((profile) => [profile, fitRidgePredictor(trainingRows, targetRow, profile)]),
  ) as Record<PromptProfile, number>;
  return selectHighestYieldProfile(predictedYields);
}

function predict(
  model: ModelName,
  trainingRows: ObservedOutcomeRow[],
  targetRow: ObservedOutcomeRow,
): PromptProfile {
  switch (model) {
    case 'family-mean-yield':
      return predictByGroupedMean(
        trainingRows,
        targetRow,
        (row) => row.task.features.blockedMetricFamily,
      );
    case 'global-mean-yield':
      return selectHighestYieldProfile(averageYields(trainingRows));
    case 'metric-family-router':
      return metricFamilyRouter(targetRow.task);
    case 'plugin-mean-yield':
      return predictByGroupedMean(trainingRows, targetRow, (row) => row.task.plugin);
    case 'ridge-yield':
      return predictWithRidge(trainingRows, targetRow);
  }
}

function evaluateModels(
  trainingRows: ObservedOutcomeRow[],
  evaluationRows: ObservedOutcomeRow[],
): Record<ModelName, EvaluationSummary> {
  return Object.fromEntries(
    (
      [
        'metric-family-router',
        'global-mean-yield',
        'family-mean-yield',
        'plugin-mean-yield',
        'ridge-yield',
      ] as const
    ).map((model) => [
      model,
      summarizePredictions(
        evaluationRows.map((row) => {
          const predictedProfile = predict(model, trainingRows, row);
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
  ) as Record<ModelName, EvaluationSummary>;
}

function evaluateLeaveOneOut(rows: ObservedOutcomeRow[]) {
  return Object.fromEntries(
    (
      [
        'metric-family-router',
        'global-mean-yield',
        'family-mean-yield',
        'plugin-mean-yield',
        'ridge-yield',
      ] as const
    ).map((model) => {
      const predictions = rows.map((row) => {
        const trainingRows = rows.filter((candidate) => candidate.task.id !== row.task.id);
        const predictedProfile = predict(model, trainingRows, row);
        return {
          actualWinner: row.observedWinner,
          predictedProfile,
          regret: regretForPrediction(row, predictedProfile),
          split: row.task.split,
          taskId: row.task.id,
        };
      });
      return [model, summarizePredictions(predictions)];
    }),
  ) as Record<ModelName, EvaluationSummary>;
}

async function main() {
  const [inputPath] = process.argv.slice(2);
  if (!inputPath) {
    throw new Error(
      'Usage: tsx scripts/redteam-research/evaluateRepairYieldModels.ts <redteam.yaml>',
    );
  }
  const { accepted } = await buildValidatedRepairTaskBenchmark(inputPath);
  const observedRows = buildObservedOutcomeRows(accepted);
  const trainingRows = observedRows.filter((row) => row.task.split === 'train');
  const holdoutRows = observedRows.filter((row) => row.task.split === 'holdout');

  console.log(
    JSON.stringify(
      {
        featureNames,
        holdout: evaluateModels(trainingRows, holdoutRows),
        leaveOneOut: evaluateLeaveOneOut(observedRows),
        ridgeLambda,
      },
      null,
      2,
    ),
  );
}

await main();
