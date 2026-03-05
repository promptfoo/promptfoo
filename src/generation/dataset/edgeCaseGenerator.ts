import dedent from 'dedent';
import logger from '../../logger';
import invariant from '../../util/invariant';
import { extractJsonObjects } from '../../util/json';
import { extractVariablesFromTemplates } from '../../util/templates';

import type { ApiProvider } from '../../types';
import type { ConceptAnalysis, EdgeCase, EdgeCaseOptions, EdgeCaseType } from '../types';

const DEFAULT_OPTIONS: EdgeCaseOptions = {
  enabled: true,
  types: ['boundary', 'format', 'empty', 'special-chars'],
  count: 10,
  includeAdversarial: false,
};

/**
 * Descriptions and examples for each edge case type.
 */
const EDGE_CASE_DESCRIPTIONS: Record<EdgeCaseType, { description: string; examples: string[] }> = {
  boundary: {
    description: 'Test boundary conditions and limits',
    examples: [
      'Very short values (1-2 characters)',
      'Values at maximum expected length',
      'Numeric boundaries (0, 1, -1, MAX_INT)',
      'Date boundaries (leap years, end of month)',
    ],
  },
  format: {
    description: 'Test format and structure variations',
    examples: [
      'Unexpected formats (dates, times, numbers)',
      'Mixed case variations',
      'Different locale formats',
      'Invalid but close-to-valid formats',
    ],
  },
  empty: {
    description: 'Test empty, null, and whitespace handling',
    examples: [
      'Empty strings',
      'Whitespace only',
      'Null-like values ("null", "undefined", "none")',
      'Missing optional values',
    ],
  },
  'special-chars': {
    description: 'Test special character handling',
    examples: [
      'Unicode characters (émojis, accented letters)',
      'Escape sequences (\\n, \\t, \\r)',
      'HTML/XML characters (<, >, &)',
      'SQL special characters (\', ", ;)',
    ],
  },
  adversarial: {
    description: 'Test adversarial and malicious inputs',
    examples: [
      'Prompt injection attempts',
      'Jailbreak patterns',
      'Misleading instructions',
      'Role confusion attempts',
    ],
  },
  length: {
    description: 'Test various input lengths',
    examples: [
      'Single word inputs',
      'Very long inputs (multiple paragraphs)',
      'Inputs with unusual word/sentence ratios',
      'Repetitive patterns',
    ],
  },
};

/**
 * Generates the prompt for edge case generation.
 */
function generateEdgeCasePrompt(
  prompts: string[],
  variables: string[],
  concepts: ConceptAnalysis | undefined,
  options: EdgeCaseOptions,
): string {
  const promptsString = prompts
    .map((prompt, i) => `<Prompt index="${i + 1}">\n${prompt}\n</Prompt>`)
    .join('\n\n');

  const variablesString = variables.map((v) => `- ${v}`).join('\n');

  const edgeCaseTypesString = options.types
    .map((type) => {
      const info = EDGE_CASE_DESCRIPTIONS[type];
      return dedent`
        ### ${type.toUpperCase()}
        ${info.description}
        Examples:
        ${info.examples.map((e) => `- ${e}`).join('\n')}
      `;
    })
    .join('\n\n');

  const conceptsSection = concepts
    ? dedent`

      ## Context from Concept Analysis

      **Topics:** ${concepts.topics.map((t) => t.name).join(', ')}
      **Entities:** ${concepts.entities.map((e) => e.name).join(', ')}
      **Constraints:** ${concepts.constraints.map((c) => `${c.description} (${c.type})`).join('; ')}
    `
    : '';

  return dedent`
    You are a QA engineer specializing in edge case testing for LLM applications.

    ## Application Prompts

    <Prompts>
    ${promptsString}
    </Prompts>

    ## Template Variables

    The prompts use these variables that need test values:
    ${variablesString}
    ${conceptsSection}

    ## Edge Case Types to Generate

    ${edgeCaseTypesString}

    ## Instructions

    Generate exactly ${options.count} edge case test inputs that would stress-test this application.
    Each edge case should:
    1. Target a specific edge case type from the list above
    2. Provide values for ALL template variables
    3. Be realistic enough to potentially occur in production
    4. Include a clear description of what edge case it tests

    ${
      options.includeAdversarial
        ? ''
        : 'NOTE: Do NOT include adversarial/malicious inputs. Focus on legitimate edge cases.'
    }

    ## Output Format

    Respond with a JSON object:
    {
      "edgeCases": [
        {
          "vars": {
            ${variables.map((v) => `"${v}": "value"`).join(',\n            ')}
          },
          "type": "boundary | format | empty | special-chars | adversarial | length",
          "description": "What this edge case tests",
          "severity": "low | medium | high"
        }
      ]
    }

    Return ONLY the JSON object, no additional text.
  `;
}

/**
 * Generates predefined edge cases without using an LLM.
 * Useful for basic edge case coverage.
 */
function generatePredefinedEdgeCases(variables: string[], types: EdgeCaseType[]): EdgeCase[] {
  const edgeCases: EdgeCase[] = [];

  for (const variable of variables) {
    // Empty/whitespace cases
    if (types.includes('empty')) {
      edgeCases.push({
        vars: Object.fromEntries(variables.map((v) => [v, v === variable ? '' : 'normal value'])),
        type: 'empty',
        description: `Empty string for ${variable}`,
        severity: 'medium',
      });
      edgeCases.push({
        vars: Object.fromEntries(
          variables.map((v) => [v, v === variable ? '   ' : 'normal value']),
        ),
        type: 'empty',
        description: `Whitespace only for ${variable}`,
        severity: 'low',
      });
    }

    // Special character cases
    if (types.includes('special-chars')) {
      edgeCases.push({
        vars: Object.fromEntries(
          variables.map((v) => [v, v === variable ? 'Test with émojis 🎉🚀' : 'normal value']),
        ),
        type: 'special-chars',
        description: `Unicode and emojis in ${variable}`,
        severity: 'low',
      });
      edgeCases.push({
        vars: Object.fromEntries(
          variables.map((v) => [
            v,
            v === variable ? 'Test with <html> & "quotes"' : 'normal value',
          ]),
        ),
        type: 'special-chars',
        description: `HTML special characters in ${variable}`,
        severity: 'medium',
      });
    }

    // Length cases
    if (types.includes('length')) {
      edgeCases.push({
        vars: Object.fromEntries(variables.map((v) => [v, v === variable ? 'X' : 'normal value'])),
        type: 'length',
        description: `Single character for ${variable}`,
        severity: 'low',
      });
      edgeCases.push({
        vars: Object.fromEntries(
          variables.map((v) => [
            v,
            v === variable
              ? 'This is an extremely long input value that goes on and on and on '.repeat(10)
              : 'normal value',
          ]),
        ),
        type: 'length',
        description: `Very long value for ${variable}`,
        severity: 'medium',
      });
    }

    // Boundary cases
    if (types.includes('boundary')) {
      edgeCases.push({
        vars: Object.fromEntries(variables.map((v) => [v, v === variable ? '0' : 'normal value'])),
        type: 'boundary',
        description: `Zero/boundary value for ${variable}`,
        severity: 'low',
      });
    }

    // Format cases
    if (types.includes('format')) {
      edgeCases.push({
        vars: Object.fromEntries(
          variables.map((v) => [v, v === variable ? 'ALLCAPS SHOUTING TEXT' : 'normal value']),
        ),
        type: 'format',
        description: `All caps format for ${variable}`,
        severity: 'low',
      });
    }
  }

  return edgeCases;
}

/**
 * Generates edge cases for testing LLM applications.
 *
 * @param prompts - Array of prompt strings to analyze
 * @param provider - LLM provider for generation
 * @param options - Edge case generation options
 * @param concepts - Optional pre-extracted concept analysis
 * @returns Array of edge cases
 */
export async function generateEdgeCases(
  prompts: string[],
  provider: ApiProvider,
  options: Partial<EdgeCaseOptions> = {},
  concepts?: ConceptAnalysis,
): Promise<EdgeCase[]> {
  if (prompts.length === 0) {
    throw new Error('At least one prompt is required for edge case generation');
  }

  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  if (!mergedOptions.enabled) {
    logger.debug('Edge case generation is disabled');
    return [];
  }

  // Add adversarial type if enabled
  if (mergedOptions.includeAdversarial && !mergedOptions.types.includes('adversarial')) {
    mergedOptions.types = [...mergedOptions.types, 'adversarial'];
  }

  // Extract variables from prompts
  const variables = extractVariablesFromTemplates(prompts);

  if (variables.length === 0) {
    logger.warn('No template variables found - generating generic edge cases');
    // Return some predefined generic edge cases
    return generatePredefinedEdgeCases(['input'], mergedOptions.types).slice(
      0,
      mergedOptions.count,
    );
  }

  logger.debug(
    `Generating ${mergedOptions.count} edge cases for ${variables.length} variables ` +
      `(types: ${mergedOptions.types.join(', ')})`,
  );

  const edgeCasePrompt = generateEdgeCasePrompt(prompts, variables, concepts, mergedOptions);
  logger.debug('Generated edge case generation prompt');

  const response = await provider.callApi(edgeCasePrompt);
  invariant(typeof response.output !== 'undefined', 'Provider response output must be defined');

  const output =
    typeof response.output === 'string' ? response.output : JSON.stringify(response.output);
  logger.debug(`Received edge case generation response: ${output.substring(0, 200)}...`);

  // Parse the JSON response
  const jsonObjects = extractJsonObjects(output);
  invariant(
    jsonObjects.length >= 1,
    `Expected at least one JSON object in edge case response, got ${jsonObjects.length}`,
  );

  const rawResult = jsonObjects[0] as { edgeCases: unknown[] };
  invariant(Array.isArray(rawResult.edgeCases), 'Expected edgeCases array in response');

  // Validate and transform edge cases
  const edgeCases: EdgeCase[] = [];
  for (const rawCase of rawResult.edgeCases) {
    if (typeof rawCase !== 'object' || rawCase === null) {
      continue;
    }

    const caseObj = rawCase as Record<string, unknown>;

    // Validate required fields
    if (
      typeof caseObj.vars !== 'object' ||
      caseObj.vars === null ||
      typeof caseObj.type !== 'string' ||
      typeof caseObj.description !== 'string'
    ) {
      logger.warn('Invalid edge case format, skipping');
      continue;
    }

    // Validate type is one of the allowed types
    const type = caseObj.type as EdgeCaseType;
    if (!['boundary', 'format', 'empty', 'special-chars', 'adversarial', 'length'].includes(type)) {
      logger.warn(`Invalid edge case type: ${type}, skipping`);
      continue;
    }

    edgeCases.push({
      vars: caseObj.vars as Record<string, string>,
      type,
      description: caseObj.description,
      severity:
        typeof caseObj.severity === 'string' && ['low', 'medium', 'high'].includes(caseObj.severity)
          ? (caseObj.severity as 'low' | 'medium' | 'high')
          : undefined,
    });
  }

  logger.debug(`Generated ${edgeCases.length} valid edge cases`);

  // If LLM didn't generate enough, add predefined ones
  if (edgeCases.length < mergedOptions.count) {
    const predefined = generatePredefinedEdgeCases(variables, mergedOptions.types);
    const needed = mergedOptions.count - edgeCases.length;
    edgeCases.push(...predefined.slice(0, needed));
    logger.debug(`Added ${Math.min(needed, predefined.length)} predefined edge cases`);
  }

  return edgeCases.slice(0, mergedOptions.count);
}

/**
 * Generates only specific types of edge cases.
 *
 * @param prompts - Array of prompt strings
 * @param provider - LLM provider
 * @param types - Specific edge case types to generate
 * @param count - Number of edge cases per type
 * @returns Array of edge cases
 */
export async function generateEdgeCasesByType(
  prompts: string[],
  provider: ApiProvider,
  types: EdgeCaseType[],
  count: number = 3,
): Promise<EdgeCase[]> {
  return generateEdgeCases(prompts, provider, {
    types,
    count: count * types.length,
    includeAdversarial: types.includes('adversarial'),
  });
}
