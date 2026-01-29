import dedent from 'dedent';
import logger from '../../logger';
import invariant from '../../util/invariant';
import { extractJsonObjects } from '../../util/json';
import { PersonaSchema } from '../types';

import type { ApiProvider } from '../../types';
import type { ConceptAnalysis, Persona, PersonaOptions } from '../types';

const DEFAULT_OPTIONS: PersonaOptions = {
  type: 'mixed',
  grounded: true,
  count: 5,
  includeEdgeCases: true,
};

/**
 * Generates the prompt for persona generation.
 */
function generatePersonaPrompt(
  prompts: string[],
  concepts: ConceptAnalysis | undefined,
  options: PersonaOptions,
): string {
  const promptsString = prompts
    .map((prompt, i) => `<Prompt index="${i + 1}">\n${prompt}\n</Prompt>`)
    .join('\n\n');

  const conceptsSection = concepts
    ? dedent`

      ## Extracted Concepts

      **Topics:** ${concepts.topics.map((t) => t.name).join(', ')}

      **Entities:** ${concepts.entities.map((e) => e.name).join(', ')}

      **Constraints:** ${concepts.constraints.map((c) => c.description).join('; ')}
    `
    : '';

  const personaTypeGuidance = {
    demographic: dedent`
      Focus on demographic diversity:
      - Vary age ranges (young adult, middle-aged, senior)
      - Vary geographic regions (urban, suburban, rural; different countries)
      - Vary expertise levels (novice, intermediate, expert)
      - Vary occupations and backgrounds
    `,
    behavioral: dedent`
      Focus on behavioral diversity:
      - Vary communication styles (formal, casual, terse, verbose)
      - Vary goals and motivations
      - Vary technical proficiency
      - Vary patience levels and attention to detail
    `,
    'role-based': dedent`
      Focus on role-based diversity:
      - Include different professional roles
      - Include different organizational positions
      - Include different industry contexts
      - Include both internal and external users
    `,
    mixed: dedent`
      Create a balanced mix of personas with diversity across:
      - Demographics (age, location, expertise)
      - Behaviors (communication style, goals)
      - Roles (professional context, industry)
    `,
  };

  const edgeCaseGuidance = options.includeEdgeCases
    ? dedent`

      ## Edge Case Personas (IMPORTANT)

      At least one persona MUST be an edge case. Include at least one of:
      - A complete novice who makes basic mistakes or misunderstands the task
      - An adversarial user who might try to break or misuse the system
      - A user with accessibility needs (visual impairment, motor difficulties)
      - A non-native speaker with language barriers
      - A rushed user who provides minimal or incomplete information
    `
    : '';

  const groundedStructure = options.grounded
    ? dedent`
      For each persona, provide structured data:
      {
        "name": "Descriptive name",
        "description": "2-3 sentence description",
        "demographics": {
          "ageRange": "e.g., 25-34",
          "region": "e.g., North America, Urban",
          "expertise": "novice | intermediate | expert",
          "occupation": "e.g., Software Engineer"
        },
        "goals": ["Primary goal", "Secondary goal"],
        "behaviors": ["Behavior trait 1", "Behavior trait 2"],
        "edge": "Only for edge case personas - describe the edge characteristic"
      }
    `
    : dedent`
      For each persona, provide:
      {
        "name": "Descriptive name",
        "description": "2-3 sentence description of who this persona is and how they would use this prompt"
      }
    `;

  return dedent`
    You are an expert user researcher tasked with creating diverse, realistic user personas.

    ## Application Prompts

    Analyze these prompt(s) that users would send to an LLM application:

    <Prompts>
    ${promptsString}
    </Prompts>
    ${conceptsSection}

    ## Persona Generation Guidelines

    ${personaTypeGuidance[options.type]}
    ${edgeCaseGuidance}

    ## Output Format

    Generate exactly ${options.count} diverse personas who would realistically use these prompts.

    ${groundedStructure}

    Respond with a JSON object:
    {
      "personas": [
        // Array of ${options.count} persona objects
      ]
    }

    Return ONLY the JSON object, no additional text.
  `;
}

/**
 * Generates diverse, grounded user personas based on prompts and concepts.
 *
 * @param prompts - Array of prompt strings the personas will use
 * @param provider - LLM provider for generation
 * @param options - Persona generation options
 * @param concepts - Optional pre-extracted concept analysis
 * @returns Array of generated personas
 */
export async function generatePersonas(
  prompts: string[],
  provider: ApiProvider,
  options: Partial<PersonaOptions> = {},
  concepts?: ConceptAnalysis,
): Promise<Persona[]> {
  if (prompts.length === 0) {
    throw new Error('At least one prompt is required for persona generation');
  }

  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  logger.debug(
    `Generating ${mergedOptions.count} personas (type: ${mergedOptions.type}, ` +
      `grounded: ${mergedOptions.grounded}, edgeCases: ${mergedOptions.includeEdgeCases})`,
  );

  const personaPrompt = generatePersonaPrompt(prompts, concepts, mergedOptions);
  logger.debug('Generated persona generation prompt');

  const response = await provider.callApi(personaPrompt);
  invariant(typeof response.output !== 'undefined', 'Provider response output must be defined');

  const output =
    typeof response.output === 'string' ? response.output : JSON.stringify(response.output);
  logger.debug(`Received persona generation response: ${output.substring(0, 200)}...`);

  // Parse the JSON response
  const jsonObjects = extractJsonObjects(output);
  invariant(
    jsonObjects.length >= 1,
    `Expected at least one JSON object in persona generation response, got ${jsonObjects.length}`,
  );

  const rawResult = jsonObjects[0] as { personas: unknown[] };
  invariant(Array.isArray(rawResult.personas), 'Expected personas array in response');

  // Validate and transform personas
  const personas: Persona[] = [];
  for (const rawPersona of rawResult.personas) {
    const parseResult = PersonaSchema.safeParse(rawPersona);

    if (parseResult.success) {
      personas.push(parseResult.data);
    } else {
      // Try to salvage partial persona data
      logger.warn(`Persona validation failed: ${parseResult.error.message}`);
      if (typeof rawPersona === 'object' && rawPersona !== null) {
        const partial = rawPersona as Record<string, unknown>;
        if (typeof partial.name === 'string' && typeof partial.description === 'string') {
          personas.push({
            name: partial.name,
            description: partial.description,
            demographics:
              typeof partial.demographics === 'object'
                ? (partial.demographics as Persona['demographics'])
                : undefined,
            goals: Array.isArray(partial.goals)
              ? partial.goals.filter((g): g is string => typeof g === 'string')
              : undefined,
            behaviors: Array.isArray(partial.behaviors)
              ? partial.behaviors.filter((b): b is string => typeof b === 'string')
              : undefined,
            edge: typeof partial.edge === 'string' ? partial.edge : undefined,
          });
        }
      }
    }
  }

  logger.debug(`Generated ${personas.length} valid personas`);

  // Ensure we have at least the requested count
  if (personas.length < mergedOptions.count) {
    logger.warn(`Generated ${personas.length} personas but ${mergedOptions.count} were requested`);
  }

  return personas;
}

/**
 * Generates simple string personas (backward compatible with existing synthesis).
 *
 * @param prompts - Array of prompt strings
 * @param provider - LLM provider
 * @param count - Number of personas to generate
 * @returns Array of persona description strings
 */
export async function generateSimplePersonas(
  prompts: string[],
  provider: ApiProvider,
  count: number = 5,
): Promise<string[]> {
  const personas = await generatePersonas(prompts, provider, {
    count,
    grounded: false,
    type: 'mixed',
    includeEdgeCases: false,
  });

  return personas.map((p) => p.description);
}

/**
 * Converts a Persona object to a string description for use in test case generation.
 *
 * @param persona - The persona object
 * @returns String description suitable for prompts
 */
export function personaToString(persona: Persona): string {
  const parts = [persona.description];

  if (persona.demographics) {
    const demo = persona.demographics;
    const demoStr = [
      demo.ageRange && `Age: ${demo.ageRange}`,
      demo.region && `Region: ${demo.region}`,
      demo.expertise && `Expertise: ${demo.expertise}`,
      demo.occupation && `Occupation: ${demo.occupation}`,
    ]
      .filter(Boolean)
      .join(', ');
    if (demoStr) {
      parts.push(`Demographics: ${demoStr}`);
    }
  }

  if (persona.goals && persona.goals.length > 0) {
    parts.push(`Goals: ${persona.goals.join(', ')}`);
  }

  if (persona.behaviors && persona.behaviors.length > 0) {
    parts.push(`Behaviors: ${persona.behaviors.join(', ')}`);
  }

  if (persona.edge) {
    parts.push(`Special characteristic: ${persona.edge}`);
  }

  return parts.join('. ');
}
