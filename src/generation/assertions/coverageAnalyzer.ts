import dedent from 'dedent';
import logger from '../../logger';
import invariant from '../../util/invariant';
import { extractJsonObjects } from '../../util/json';

import type { ApiProvider, Assertion } from '../../types';
import type { CoverageAnalysis, Requirement, RequirementCoverage } from '../types';

/**
 * Generates the prompt for requirements extraction.
 */
function generateRequirementsExtractionPrompt(prompts: string[]): string {
  const promptsString = prompts
    .map((prompt, i) => `<Prompt index="${i + 1}">\n${prompt}\n</Prompt>`)
    .join('\n\n');

  return dedent`
    You are a QA engineer tasked with extracting all testable requirements from application prompts.

    ## Application Prompts

    <Prompts>
    ${promptsString}
    </Prompts>

    ## Task

    Extract ALL requirements that should be tested, including:

    1. **Explicit Requirements**: Directly stated in the prompts
       - Format requirements (e.g., "respond in JSON", "use bullet points")
       - Content requirements (e.g., "include a summary", "list 3 examples")
       - Behavior requirements (e.g., "be polite", "ask clarifying questions")

    2. **Implied Requirements**: Reasonable expectations not explicitly stated
       - Relevance (response should address the input)
       - Completeness (response should fully answer the question)
       - Coherence (response should be logically structured)
       - Safety (response should not contain harmful content)

    ## Output Format

    For each requirement:
    - **id**: Unique identifier (e.g., "req-1", "req-2")
    - **description**: Clear description of what to test
    - **source**: "explicit" or "implied"
    - **testability**: "objective" (can be measured deterministically) or "subjective" (requires judgment)
    - **priority**: "high", "medium", or "low"
    - **category**: One of "format", "content", "behavior", "safety", "quality"

    Respond with JSON:
    {
      "requirements": [
        {
          "id": "req-1",
          "description": "Response must be in JSON format",
          "source": "explicit",
          "testability": "objective",
          "priority": "high",
          "category": "format"
        }
      ]
    }

    Return ONLY the JSON object, no additional text.
  `;
}

/**
 * Extracts testable requirements from prompts.
 *
 * @param prompts - Array of prompt strings to analyze
 * @param provider - LLM provider for analysis
 * @returns Array of extracted requirements
 */
export async function extractRequirements(
  prompts: string[],
  provider: ApiProvider,
): Promise<Requirement[]> {
  if (prompts.length === 0) {
    throw new Error('At least one prompt is required for requirements extraction');
  }

  logger.debug(`Extracting requirements from ${prompts.length} prompt(s)`);

  const extractionPrompt = generateRequirementsExtractionPrompt(prompts);

  const response = await provider.callApi(extractionPrompt);
  invariant(typeof response.output !== 'undefined', 'Provider response must have output');

  const output =
    typeof response.output === 'string' ? response.output : JSON.stringify(response.output);
  const jsonObjects = extractJsonObjects(output);

  invariant(jsonObjects.length >= 1, `Expected at least one JSON object in requirements response`);

  const rawResult = jsonObjects[0] as { requirements: unknown[] };
  invariant(Array.isArray(rawResult.requirements), 'Expected requirements array');

  const requirements: Requirement[] = [];

  for (const rawReq of rawResult.requirements) {
    if (typeof rawReq !== 'object' || rawReq === null) {
      continue;
    }

    const req = rawReq as Record<string, unknown>;

    // Validate required fields
    if (
      typeof req.id !== 'string' ||
      typeof req.description !== 'string' ||
      typeof req.source !== 'string' ||
      typeof req.testability !== 'string'
    ) {
      logger.warn('Invalid requirement format, skipping');
      continue;
    }

    // Validate enum values
    const source = req.source as string;
    const testability = req.testability as string;

    if (!['explicit', 'implied'].includes(source)) {
      continue;
    }
    if (!['objective', 'subjective'].includes(testability)) {
      continue;
    }

    requirements.push({
      id: req.id,
      description: req.description,
      source: source as 'explicit' | 'implied',
      testability: testability as 'objective' | 'subjective',
      priority:
        typeof req.priority === 'string' && ['high', 'medium', 'low'].includes(req.priority)
          ? (req.priority as 'high' | 'medium' | 'low')
          : undefined,
      category: typeof req.category === 'string' ? req.category : undefined,
    });
  }

  logger.debug(`Extracted ${requirements.length} requirements`);

  return requirements;
}

/**
 * Determines how well an assertion covers a requirement.
 */
function assessCoverage(
  requirement: Requirement,
  assertion: Assertion,
): 'full' | 'partial' | 'none' {
  const reqLower = requirement.description.toLowerCase();
  const assertionValue = typeof assertion.value === 'string' ? assertion.value.toLowerCase() : '';
  const assertionMetric = (assertion.metric || '').toLowerCase();

  // Check for keyword overlap
  const reqWords = new Set(reqLower.split(/\s+/).filter((w) => w.length > 3));
  const assertionWords = new Set(
    `${assertionValue} ${assertionMetric}`.split(/\s+/).filter((w) => w.length > 3),
  );

  const overlap = [...reqWords].filter((w) => assertionWords.has(w));
  const overlapRatio = overlap.length / reqWords.size;

  // Check for specific patterns
  const categoryMatch =
    requirement.category &&
    (assertionValue.includes(requirement.category) ||
      assertionMetric.includes(requirement.category));

  if (overlapRatio > 0.5 || categoryMatch) {
    return 'full';
  } else if (overlapRatio > 0.2 || overlap.length > 0) {
    return 'partial';
  }

  return 'none';
}

/**
 * Analyzes how well existing assertions cover extracted requirements.
 *
 * @param requirements - Array of requirements to check
 * @param assertions - Array of existing assertions
 * @returns Coverage analysis
 */
export async function analyzeCoverage(
  requirements: Requirement[],
  assertions: Assertion[],
): Promise<CoverageAnalysis> {
  logger.debug(
    `Analyzing coverage of ${requirements.length} requirements with ${assertions.length} assertions`,
  );

  const coverages: RequirementCoverage[] = [];
  const uncoveredRequirements: string[] = [];

  for (const requirement of requirements) {
    const coveringAssertions: string[] = [];
    let bestCoverage: 'full' | 'partial' | 'none' = 'none';

    for (let i = 0; i < assertions.length; i++) {
      const coverage = assessCoverage(requirement, assertions[i]);
      if (coverage !== 'none') {
        coveringAssertions.push(`assertion-${i}`);
        if (coverage === 'full' || (coverage === 'partial' && bestCoverage === 'none')) {
          bestCoverage = coverage;
        }
      }
    }

    const reqCoverage: RequirementCoverage = {
      requirement,
      coveredBy: coveringAssertions,
      coverageLevel: bestCoverage,
    };

    if (bestCoverage === 'none') {
      uncoveredRequirements.push(requirement.description);
      reqCoverage.gaps = [`No assertions cover: ${requirement.description}`];
    } else if (bestCoverage === 'partial') {
      reqCoverage.gaps = [`Partial coverage for: ${requirement.description}`];
    }

    coverages.push(reqCoverage);
  }

  // Calculate overall score
  const fullyCovered = coverages.filter((c) => c.coverageLevel === 'full').length;
  const partiallyCovered = coverages.filter((c) => c.coverageLevel === 'partial').length;
  const overallScore =
    requirements.length > 0 ? (fullyCovered + partiallyCovered * 0.5) / requirements.length : 0;

  // Generate suggestions
  const suggestions: string[] = [];
  const uncoveredCategories = new Map<string, number>();

  for (const coverage of coverages) {
    if (coverage.coverageLevel === 'none' && coverage.requirement.category) {
      const count = uncoveredCategories.get(coverage.requirement.category) || 0;
      uncoveredCategories.set(coverage.requirement.category, count + 1);
    }
  }

  for (const [category, count] of uncoveredCategories) {
    suggestions.push(`Add ${count} more assertions for ${category} requirements`);
  }

  if (uncoveredRequirements.length > 0) {
    suggestions.push(
      `${uncoveredRequirements.length} requirements have no coverage - consider adding specific assertions`,
    );
  }

  const analysis: CoverageAnalysis = {
    requirements: coverages,
    overallScore,
    gaps: uncoveredRequirements,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  };

  logger.debug(
    `Coverage analysis: ${(overallScore * 100).toFixed(1)}% ` +
      `(${fullyCovered} full, ${partiallyCovered} partial, ${uncoveredRequirements.length} none)`,
  );

  return analysis;
}

/**
 * Generates assertion suggestions to improve coverage.
 *
 * @param prompts - Original prompts
 * @param coverage - Current coverage analysis
 * @param provider - LLM provider
 * @returns Array of suggested assertion descriptions
 */
export async function suggestAssertions(
  prompts: string[],
  coverage: CoverageAnalysis,
  provider: ApiProvider,
): Promise<string[]> {
  if (coverage.gaps.length === 0) {
    return [];
  }

  const suggestionPrompt = dedent`
    You are a QA engineer suggesting assertions to improve test coverage.

    ## Application Prompts
    ${prompts.map((p) => `<Prompt>\n${p}\n</Prompt>`).join('\n')}

    ## Coverage Gaps
    The following requirements are not adequately covered:
    ${coverage.gaps.map((g) => `- ${g}`).join('\n')}

    ## Current Coverage Score
    ${(coverage.overallScore * 100).toFixed(1)}%

    ## Task
    Suggest specific assertions that would cover these gaps.
    For each gap, provide a concrete assertion description.

    Respond with JSON:
    {
      "suggestions": [
        "Check that the response includes X",
        "Verify the output format is Y"
      ]
    }
  `;

  const response = await provider.callApi(suggestionPrompt);
  invariant(typeof response.output !== 'undefined', 'Provider response must have output');

  const output =
    typeof response.output === 'string' ? response.output : JSON.stringify(response.output);
  const jsonObjects = extractJsonObjects(output);

  if (jsonObjects.length === 0) {
    return [];
  }

  const result = jsonObjects[0] as { suggestions: string[] };
  return Array.isArray(result.suggestions) ? result.suggestions : [];
}
