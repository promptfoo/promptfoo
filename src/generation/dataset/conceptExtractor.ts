import dedent from 'dedent';
import logger from '../../logger';
import invariant from '../../util/invariant';
import { extractJsonObjects } from '../../util/json';
import { extractVariablesFromTemplates } from '../../util/templates';
import { ConceptAnalysisSchema } from '../types';

import type { ApiProvider } from '../../types';
import type { ConceptAnalysis, ConceptExtractionOptions } from '../types';

const DEFAULT_OPTIONS: ConceptExtractionOptions = {
  maxTopics: 5,
  maxEntities: 10,
  includeConstraints: true,
  includeVariableRelationships: true,
};

/**
 * Generates the prompt for concept extraction.
 */
function generateConceptExtractionPrompt(
  prompts: string[],
  variables: string[],
  options: ConceptExtractionOptions,
): string {
  const promptsString = prompts
    .map((prompt, i) => `<Prompt index="${i + 1}">\n${prompt}\n</Prompt>`)
    .join('\n\n');

  const variablesString =
    variables.length > 0 ? `\n\nVariables found in prompts: ${variables.join(', ')}` : '';

  return dedent`
    You are an expert analyst tasked with extracting semantic concepts from LLM prompts.
    Analyze the following prompt${prompts.length > 1 ? 's' : ''} and extract key concepts.

    <Prompts>
    ${promptsString}
    </Prompts>
    ${variablesString}

    Extract and categorize the following:

    1. **Topics** (up to ${options.maxTopics}): Main subjects or themes the prompts are about.
       For each topic, provide:
       - name: A concise name for the topic
       - description: Brief explanation of what this topic covers
       - relevance: Score from 0-1 indicating how central this topic is

    2. **Entities** (up to ${options.maxEntities}): Nouns, objects, people, or concepts mentioned.
       For each entity, provide:
       - name: The entity name
       - type: Category (e.g., "person", "object", "concept", "action")
       - occurrences: How many times it appears or is implied

    ${
      options.includeConstraints
        ? `
    3. **Constraints**: Requirements or limitations implied or stated in the prompts.
       For each constraint, provide:
       - description: What the constraint is
       - type: One of "format", "content", "behavior", "length", "style"
       - source: Either "explicit" (stated directly) or "implied" (inferred)
    `
        : ''
    }

    ${
      options.includeVariableRelationships && variables.length > 0
        ? `
    4. **Variable Relationships**: How the template variables relate to each other.
       For each relationship, provide:
       - variables: Array of variable names involved
       - relationship: Description of how they relate
    `
        : ''
    }

    Respond with a JSON object in this exact format:
    {
      "topics": [
        { "name": "...", "description": "...", "relevance": 0.9 }
      ],
      "entities": [
        { "name": "...", "type": "...", "occurrences": 1 }
      ]${
        options.includeConstraints
          ? `,
      "constraints": [
        { "description": "...", "type": "format", "source": "explicit" }
      ]`
          : ''
      }${
        options.includeVariableRelationships && variables.length > 0
          ? `,
      "variableRelationships": [
        { "variables": ["var1", "var2"], "relationship": "..." }
      ]`
          : ''
      }
    }

    Return ONLY the JSON object, no additional text.
  `;
}

/**
 * Extracts semantic concepts from prompts using an LLM.
 *
 * This function analyzes prompts to identify:
 * - Main topics and themes
 * - Entities mentioned (nouns, objects, people)
 * - Constraints (format, content, behavior requirements)
 * - Variable relationships (how template variables relate)
 *
 * @param prompts - Array of prompt strings to analyze
 * @param provider - LLM provider to use for analysis
 * @param options - Extraction options
 * @returns Extracted concept analysis
 */
export async function extractConcepts(
  prompts: string[],
  provider: ApiProvider,
  options: Partial<ConceptExtractionOptions> = {},
): Promise<ConceptAnalysis> {
  if (prompts.length === 0) {
    throw new Error('At least one prompt is required for concept extraction');
  }

  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  logger.debug(`Extracting concepts from ${prompts.length} prompt(s)`);

  // Extract variables from prompt templates
  const variables = extractVariablesFromTemplates(prompts);
  logger.debug(`Found ${variables.length} template variable(s): ${variables.join(', ')}`);

  // Generate and execute the extraction prompt
  const extractionPrompt = generateConceptExtractionPrompt(prompts, variables, mergedOptions);
  logger.debug('Generated concept extraction prompt');

  const response = await provider.callApi(extractionPrompt);
  invariant(typeof response.output !== 'undefined', 'Provider response output must be defined');

  const output =
    typeof response.output === 'string' ? response.output : JSON.stringify(response.output);
  logger.debug(`Received concept extraction response: ${output.substring(0, 200)}...`);

  // Parse the JSON response
  const jsonObjects = extractJsonObjects(output);
  invariant(
    jsonObjects.length >= 1,
    `Expected at least one JSON object in concept extraction response, got ${jsonObjects.length}`,
  );

  // Validate against schema
  const rawAnalysis = jsonObjects[0];
  const parseResult = ConceptAnalysisSchema.safeParse(rawAnalysis);

  if (!parseResult.success) {
    logger.warn(`Concept analysis validation failed: ${parseResult.error.message}`);
    // Return a partial result with defaults for missing fields
    // Cast to allow property access on the raw object
    const raw = rawAnalysis as Record<string, unknown>;
    return {
      topics: Array.isArray(raw.topics)
        ? (raw.topics as ConceptAnalysis['topics']).slice(0, mergedOptions.maxTopics)
        : [],
      entities: Array.isArray(raw.entities)
        ? (raw.entities as ConceptAnalysis['entities']).slice(0, mergedOptions.maxEntities)
        : [],
      constraints: Array.isArray(raw.constraints)
        ? (raw.constraints as ConceptAnalysis['constraints'])
        : [],
      variableRelationships: Array.isArray(raw.variableRelationships)
        ? (raw.variableRelationships as ConceptAnalysis['variableRelationships'])
        : [],
    };
  }

  const analysis = parseResult.data;

  // Enforce limits
  if (analysis.topics.length > mergedOptions.maxTopics) {
    analysis.topics = analysis.topics.slice(0, mergedOptions.maxTopics);
  }
  if (analysis.entities.length > mergedOptions.maxEntities) {
    analysis.entities = analysis.entities.slice(0, mergedOptions.maxEntities);
  }

  logger.debug(
    `Extracted ${analysis.topics.length} topics, ${analysis.entities.length} entities, ` +
      `${analysis.constraints.length} constraints`,
  );

  return analysis;
}

/**
 * Extracts topics only from prompts (lightweight extraction).
 *
 * @param prompts - Array of prompt strings to analyze
 * @param provider - LLM provider to use
 * @param maxTopics - Maximum number of topics to extract
 * @returns Array of topic names
 */
export async function extractTopics(
  prompts: string[],
  provider: ApiProvider,
  maxTopics: number = 5,
): Promise<string[]> {
  const analysis = await extractConcepts(prompts, provider, {
    maxTopics,
    maxEntities: 0,
    includeConstraints: false,
    includeVariableRelationships: false,
  });

  return analysis.topics.map((t) => t.name);
}

/**
 * Extracts entities only from prompts (lightweight extraction).
 *
 * @param prompts - Array of prompt strings to analyze
 * @param provider - LLM provider to use
 * @param maxEntities - Maximum number of entities to extract
 * @returns Array of entity objects
 */
export async function extractEntities(
  prompts: string[],
  provider: ApiProvider,
  maxEntities: number = 10,
): Promise<Array<{ name: string; type?: string }>> {
  const analysis = await extractConcepts(prompts, provider, {
    maxTopics: 0,
    maxEntities,
    includeConstraints: false,
    includeVariableRelationships: false,
  });

  return analysis.entities.map((e) => ({ name: e.name, type: e.type }));
}
