const dataset = require('./dataset.json');

const references = new Map(dataset.tiles.map((tile) => [tile.tileId, tile]));
const countRanges = ['0', '1-10', '11-20', '21-50', '51-100', '>100'];
const assessmentFields = [
  'building_flooded',
  'road_flooded',
  'flooded_building_count_range',
  'flooded_road_count_range',
];
const responseFields = new Set([...assessmentFields, 'abstain']);
const statuses = new Set(['yes', 'no', 'unknown']);
const countAnswers = new Set([...countRanges, 'unknown']);

function parseOutput(output) {
  if (output && typeof output === 'object' && !Array.isArray(output)) {
    return output;
  }
  const parsed = JSON.parse(output);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Output must be a JSON object');
  }
  return parsed;
}

function countRangeScore(predicted, expected) {
  const predictedIndex = countRanges.indexOf(predicted);
  const expectedIndex = countRanges.indexOf(expected);
  if (predictedIndex === -1 || expectedIndex === -1) {
    return 0;
  }
  const distance = Math.abs(predictedIndex - expectedIndex);
  if (distance === 0) {
    return 1;
  }
  return distance === 1 ? 0.5 : 0;
}

function hasValidFields(output) {
  const fields = Object.keys(output);
  return (
    fields.length === responseFields.size &&
    fields.every((field) => responseFields.has(field)) &&
    statuses.has(output.building_flooded) &&
    statuses.has(output.road_flooded) &&
    countAnswers.has(output.flooded_building_count_range) &&
    countAnswers.has(output.flooded_road_count_range) &&
    typeof output.abstain === 'boolean'
  );
}

function classScores(expectedBuilding, expectedRoad, buildingScore, roadScore) {
  return {
    [expectedBuilding === 'yes' ? 'building_flood_recall' : 'building_clear_specificity']:
      buildingScore,
    [expectedRoad === 'yes' ? 'road_flood_recall' : 'road_clear_specificity']: roadScore,
  };
}

function invalidDecision(reason, expectedBuilding, expectedRoad) {
  return {
    pass: false,
    score: 0,
    reason,
    namedScores: {
      coverage: 0,
      decision_consistency: 0,
      ...classScores(expectedBuilding, expectedRoad, 0, 0),
    },
  };
}

function gradeFloodAssessment(output, context) {
  const reference = references.get(context?.vars?.tile_id);
  if (!reference) {
    return {
      pass: false,
      score: 0,
      reason: `Unknown tile: ${context?.vars?.tile_id}`,
      namedScores: { coverage: 0, decision_consistency: 0 },
    };
  }

  const expectedBuilding = reference.counts.building.flooded > 0 ? 'yes' : 'no';
  const expectedRoad = reference.counts.road.flooded > 0 ? 'yes' : 'no';

  let parsed;
  try {
    parsed = parseOutput(output);
  } catch (error) {
    return invalidDecision(
      `Could not grade output: ${error.message}`,
      expectedBuilding,
      expectedRoad,
    );
  }

  if (!hasValidFields(parsed)) {
    return invalidDecision('Output does not match the response schema', expectedBuilding, expectedRoad);
  }

  const answers = assessmentFields.map((field) => parsed[field]);
  const hasUnknown = answers.includes('unknown');
  const allUnknown = answers.every((answer) => answer === 'unknown');

  if (parsed.abstain === true && allUnknown) {
    return {
      pass: true,
      score: 0,
      reason: 'Consistent abstention; excluded from selective accuracy',
      namedScores: {
        coverage: 0,
        decision_consistency: 1,
        ...classScores(expectedBuilding, expectedRoad, 0, 0),
      },
    };
  }

  if (parsed.abstain !== false || hasUnknown) {
    return invalidDecision(
      'Inconsistent decision: either answer every field or abstain with every field set to unknown',
      expectedBuilding,
      expectedRoad,
    );
  }

  const buildingStatus = Number(parsed.building_flooded === expectedBuilding);
  const roadStatus = Number(parsed.road_flooded === expectedRoad);
  const buildingCount = countRangeScore(
    parsed.flooded_building_count_range,
    reference.referenceRanges.floodedBuildings,
  );
  const roadCount = countRangeScore(
    parsed.flooded_road_count_range,
    reference.referenceRanges.floodedRoads,
  );
  const exactMatch = Number(
    buildingStatus === 1 && roadStatus === 1 && buildingCount === 1 && roadCount === 1,
  );
  const selectiveAccuracy = (buildingStatus + roadStatus + buildingCount + roadCount) / 4;

  return {
    pass: exactMatch === 1,
    score: selectiveAccuracy,
    reason:
      exactMatch === 1
        ? 'Exact labeled match'
        : `Answered with ${(selectiveAccuracy * 100).toFixed(0)}% selective accuracy`,
    namedScores: {
      coverage: 1,
      decision_consistency: 1,
      selective_accuracy: selectiveAccuracy,
      exact_match_answered: exactMatch,
      building_status_accuracy: buildingStatus,
      road_status_accuracy: roadStatus,
      building_count_score: buildingCount,
      road_count_score: roadCount,
      ...classScores(expectedBuilding, expectedRoad, buildingStatus, roadStatus),
    },
  };
}

module.exports = { gradeFloodAssessment };
