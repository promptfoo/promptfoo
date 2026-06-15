const dataset = require('./dataset.json');

const references = new Map(dataset.tiles.map((tile) => [tile.tileId, tile]));
const metrics = [
  'building_status_accuracy',
  'road_status_accuracy',
  'building_count_accuracy',
  'road_count_accuracy',
  'non_abstention',
];

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

function zero(reason) {
  return {
    pass: false,
    score: 0,
    reason,
    namedScores: Object.fromEntries(metrics.map((metric) => [metric, 0])),
  };
}

function gradeFloodAssessment(output, context) {
  try {
    const parsed = parseOutput(output);
    const reference = references.get(context?.vars?.tile_id);
    if (!reference) {
      return zero(`Unknown tile: ${context?.vars?.tile_id}`);
    }

    const expectedBuilding = reference.counts.building.flooded > 0 ? 'yes' : 'no';
    const expectedRoad = reference.counts.road.flooded > 0 ? 'yes' : 'no';
    const namedScores = {
      building_status_accuracy: Number(parsed.building_flooded === expectedBuilding),
      road_status_accuracy: Number(parsed.road_flooded === expectedRoad),
      building_count_accuracy: Number(
        parsed.flooded_building_count_range === reference.referenceRanges.floodedBuildings,
      ),
      road_count_accuracy: Number(
        parsed.flooded_road_count_range === reference.referenceRanges.floodedRoads,
      ),
      non_abstention: Number(parsed.abstain === false),
    };
    const failed = metrics.filter((metric) => namedScores[metric] !== 1);
    const score =
      Object.values(namedScores).reduce((sum, value) => sum + value, 0) / metrics.length;
    return {
      pass: failed.length === 0,
      score,
      reason: failed.length === 0 ? 'All labeled fields matched' : `Failed: ${failed.join(', ')}`,
      namedScores,
    };
  } catch (error) {
    return zero(`Could not grade output: ${error.message}`);
  }
}

module.exports = { gradeFloodAssessment };
