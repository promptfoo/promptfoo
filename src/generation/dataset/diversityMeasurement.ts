import logger from '../../logger';
import { getDefaultProviders } from '../../providers/defaults';

import type { ApiEmbeddingProvider, ApiProvider, VarMapping } from '../../types';
import type { ConceptAnalysis, DiversityMetrics, DiversityOptions } from '../types';

// Default diversity options for reference (not currently used but defines API defaults)
const _DEFAULT_OPTIONS: DiversityOptions = {
  enabled: true,
  targetScore: 0.7,
  measureMethod: 'embedding',
};

/**
 * Calculates cosine similarity between two vectors.
 * Replicates the function from src/matchers.ts for local use.
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must be of equal length');
  }
  const dotProduct = vecA.reduce((acc, val, idx) => acc + val * vecB[idx], 0);
  const vecAMagnitude = Math.sqrt(vecA.reduce((acc, val) => acc + val * val, 0));
  const vecBMagnitude = Math.sqrt(vecB.reduce((acc, val) => acc + val * val, 0));

  if (vecAMagnitude === 0 || vecBMagnitude === 0) {
    return 0;
  }

  return dotProduct / (vecAMagnitude * vecBMagnitude);
}

/**
 * Calculates cosine distance (1 - similarity).
 */
function cosineDistance(vecA: number[], vecB: number[]): number {
  return 1 - cosineSimilarity(vecA, vecB);
}

/**
 * Converts a test case (VarMapping) to a text string for embedding.
 */
function testCaseToText(testCase: VarMapping): string {
  return Object.entries(testCase)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
}

/**
 * Calculates simple text-based diversity using character n-grams.
 * Used as a fallback when embedding provider is not available.
 */
function calculateTextDiversity(testCases: VarMapping[]): DiversityMetrics {
  if (testCases.length <= 1) {
    return {
      score: testCases.length === 1 ? 1 : 0,
      averageDistance: 0,
      minDistance: 0,
      maxDistance: 0,
    };
  }

  const texts = testCases.map(testCaseToText);

  // Calculate Jaccard distance using word sets
  const wordSets = texts.map((text) => new Set(text.toLowerCase().split(/\s+/)));

  const distances: number[] = [];

  for (let i = 0; i < wordSets.length; i++) {
    for (let j = i + 1; j < wordSets.length; j++) {
      const setA = wordSets[i];
      const setB = wordSets[j];

      const intersection = new Set([...setA].filter((x) => setB.has(x)));
      const union = new Set([...setA, ...setB]);

      const jaccard = union.size > 0 ? intersection.size / union.size : 0;
      const distance = 1 - jaccard;
      distances.push(distance);
    }
  }

  const averageDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
  const minDistance = Math.min(...distances);
  const maxDistance = Math.max(...distances);

  return {
    score: averageDistance, // Higher distance = more diverse
    averageDistance,
    minDistance,
    maxDistance,
  };
}

/**
 * Checks if a provider has embedding capability.
 */
function hasEmbeddingCapability(provider: ApiProvider): provider is ApiEmbeddingProvider {
  return 'callEmbeddingApi' in provider && typeof provider.callEmbeddingApi === 'function';
}

/**
 * Gets embeddings for test cases using the provider.
 */
async function getEmbeddings(
  testCases: VarMapping[],
  provider: ApiEmbeddingProvider,
): Promise<number[][]> {
  const texts = testCases.map(testCaseToText);
  const embeddings: number[][] = [];

  for (const text of texts) {
    const response = await provider.callEmbeddingApi(text);
    if (response.embedding) {
      embeddings.push(response.embedding);
    } else {
      throw new Error('Embedding response did not contain embedding');
    }
  }

  return embeddings;
}

/**
 * Measures diversity of test cases using embeddings.
 *
 * @param testCases - Array of test cases to measure
 * @param provider - Optional embedding provider (uses default if not provided)
 * @returns Diversity metrics
 */
export async function measureDiversity(
  testCases: VarMapping[],
  provider?: ApiProvider,
): Promise<DiversityMetrics> {
  if (testCases.length <= 1) {
    return {
      score: testCases.length === 1 ? 1 : 0,
      averageDistance: 0,
      minDistance: 0,
      maxDistance: 0,
    };
  }

  logger.debug(`Measuring diversity of ${testCases.length} test cases`);

  // Try to get an embedding provider
  let embeddingProvider: ApiEmbeddingProvider | undefined;

  if (provider && hasEmbeddingCapability(provider)) {
    embeddingProvider = provider;
  } else {
    try {
      const defaults = await getDefaultProviders();
      if (hasEmbeddingCapability(defaults.embeddingProvider)) {
        embeddingProvider = defaults.embeddingProvider;
      }
    } catch (error) {
      logger.debug(`Could not load default embedding provider: ${error}`);
    }
  }

  // Fall back to text-based diversity if no embedding provider
  if (!embeddingProvider) {
    logger.debug('No embedding provider available, using text-based diversity measurement');
    return calculateTextDiversity(testCases);
  }

  try {
    logger.debug('Getting embeddings for test cases');
    const embeddings = await getEmbeddings(testCases, embeddingProvider);

    // Calculate pairwise distances
    const distances: number[] = [];
    for (let i = 0; i < embeddings.length; i++) {
      for (let j = i + 1; j < embeddings.length; j++) {
        distances.push(cosineDistance(embeddings[i], embeddings[j]));
      }
    }

    const averageDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
    const minDistance = Math.min(...distances);
    const maxDistance = Math.max(...distances);

    // Normalize score to 0-1 range (cosine distance is already 0-2, but usually 0-1 in practice)
    const score = Math.min(1, averageDistance);

    logger.debug(`Diversity metrics: score=${score.toFixed(3)}, avg=${averageDistance.toFixed(3)}`);

    return {
      score,
      averageDistance,
      minDistance,
      maxDistance,
    };
  } catch (error) {
    logger.warn(`Embedding-based diversity measurement failed: ${error}`);
    logger.debug('Falling back to text-based diversity measurement');
    return calculateTextDiversity(testCases);
  }
}

/**
 * Identifies coverage gaps in test cases based on concept analysis.
 *
 * @param testCases - Array of test cases to analyze
 * @param concepts - Concept analysis from prompt extraction
 * @param provider - Optional provider for embedding-based analysis
 * @returns Array of gap descriptions
 */
export async function identifyGaps(
  testCases: VarMapping[],
  concepts: ConceptAnalysis,
  _provider?: ApiProvider,
): Promise<string[]> {
  const gaps: string[] = [];

  if (testCases.length === 0) {
    gaps.push('No test cases generated');
    return gaps;
  }

  // Convert test cases to searchable text
  const testTexts = testCases.map(testCaseToText).join('\n\n');
  const testTextsLower = testTexts.toLowerCase();

  // Check topic coverage
  for (const topic of concepts.topics) {
    const topicWords = topic.name.toLowerCase().split(/\s+/);
    const covered = topicWords.some((word) => testTextsLower.includes(word));
    if (!covered) {
      gaps.push(`Topic "${topic.name}" may not be covered in test cases`);
    }
  }

  // Check entity coverage
  for (const entity of concepts.entities) {
    const entityLower = entity.name.toLowerCase();
    if (!testTextsLower.includes(entityLower)) {
      gaps.push(`Entity "${entity.name}" is not represented in test cases`);
    }
  }

  // Check constraint coverage
  for (const constraint of concepts.constraints) {
    // For format constraints, check if test cases exercise different formats
    if (constraint.type === 'format') {
      gaps.push(`Format constraint "${constraint.description}" may need more test cases`);
    }
  }

  // Analyze variable value distribution
  const variableValues: Record<string, Set<string>> = {};
  for (const testCase of testCases) {
    for (const [key, value] of Object.entries(testCase)) {
      if (!variableValues[key]) {
        variableValues[key] = new Set();
      }
      variableValues[key].add(value);
    }
  }

  // Check for variables with low diversity
  for (const [variable, values] of Object.entries(variableValues)) {
    const uniqueRatio = values.size / testCases.length;
    if (uniqueRatio < 0.5 && testCases.length > 3) {
      gaps.push(`Variable "${variable}" has low diversity (${values.size} unique values)`);
    }
  }

  logger.debug(`Identified ${gaps.length} coverage gaps`);

  return gaps;
}

/**
 * Calculates variable-level coverage statistics.
 *
 * @param testCases - Array of test cases
 * @returns Coverage statistics per variable
 */
export function analyzeVariableCoverage(
  testCases: VarMapping[],
): Record<string, { uniqueValues: number; coverage: number; sampleValues: string[] }> {
  if (testCases.length === 0) {
    return {};
  }

  const variableStats: Record<
    string,
    { uniqueValues: number; coverage: number; sampleValues: string[] }
  > = {};

  // Gather all values for each variable
  const variableValues: Record<string, string[]> = {};
  for (const testCase of testCases) {
    for (const [key, value] of Object.entries(testCase)) {
      if (!variableValues[key]) {
        variableValues[key] = [];
      }
      variableValues[key].push(value);
    }
  }

  // Calculate statistics
  for (const [variable, values] of Object.entries(variableValues)) {
    const uniqueValues = new Set(values);
    variableStats[variable] = {
      uniqueValues: uniqueValues.size,
      coverage: uniqueValues.size / values.length,
      sampleValues: Array.from(uniqueValues).slice(0, 5),
    };
  }

  return variableStats;
}

/**
 * Suggests additional test cases to improve diversity.
 *
 * @param testCases - Current test cases
 * @param concepts - Concept analysis
 * @param gaps - Identified gaps
 * @returns Suggestions for new test cases
 */
export function suggestDiversityImprovements(
  _testCases: VarMapping[],
  concepts: ConceptAnalysis,
  gaps: string[],
): string[] {
  const suggestions: string[] = [];

  // Suggest based on gaps
  for (const gap of gaps) {
    if (gap.includes('Topic')) {
      const topicMatch = gap.match(/"([^"]+)"/);
      if (topicMatch) {
        suggestions.push(`Add test cases that explicitly address the topic: ${topicMatch[1]}`);
      }
    } else if (gap.includes('Entity')) {
      const entityMatch = gap.match(/"([^"]+)"/);
      if (entityMatch) {
        suggestions.push(`Add test cases that include the entity: ${entityMatch[1]}`);
      }
    } else if (gap.includes('Variable') && gap.includes('low diversity')) {
      const varMatch = gap.match(/"([^"]+)"/);
      if (varMatch) {
        suggestions.push(`Increase variety of values for variable: ${varMatch[1]}`);
      }
    }
  }

  // Suggest based on constraint types
  const constraintTypes = new Set(concepts.constraints.map((c) => c.type));
  if (constraintTypes.has('length')) {
    suggestions.push('Add test cases with varying input lengths (short, medium, long)');
  }
  if (constraintTypes.has('format')) {
    suggestions.push('Add test cases with different format variations');
  }

  return suggestions;
}
