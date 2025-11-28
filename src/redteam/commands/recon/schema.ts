/**
 * JSON Schema for the recon output - used for structured output from the agent
 */
export const ReconOutputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    // Core ApplicationDefinition fields
    purpose: {
      type: 'string',
      description: 'Main purpose of the application (1-3 sentences)',
    },
    features: {
      type: 'string',
      description: 'Key features and capabilities',
    },
    industry: {
      type: 'string',
      description: 'Industry/domain (e.g., healthcare, finance, customer service)',
    },
    systemPrompt: {
      type: 'string',
      description: 'The LLM system prompt if found in code (exact text)',
    },
    hasAccessTo: {
      type: 'string',
      description: 'Systems, data, and tools the application CAN access',
    },
    doesNotHaveAccessTo: {
      type: 'string',
      description: 'Explicit restrictions on what the app cannot access',
    },
    userTypes: {
      type: 'string',
      description: 'Different user roles and their permission levels',
    },
    securityRequirements: {
      type: 'string',
      description: 'Security and compliance requirements identified',
    },
    sensitiveDataTypes: {
      type: 'string',
      description: 'Types of sensitive/PII data handled (DO NOT include actual values)',
    },
    exampleIdentifiers: {
      type: 'string',
      description:
        'Example data formats found (e.g., user ID patterns, account number formats)',
    },
    criticalActions: {
      type: 'string',
      description: 'High-risk operations the app can perform',
    },
    forbiddenTopics: {
      type: 'string',
      description: 'Topics/content the app should refuse to discuss',
    },
    attackConstraints: {
      type: 'string',
      description: 'Guardrails, rules, and safety mechanisms identified',
    },
    competitors: {
      type: 'string',
      description: 'Competitor names found in code',
    },
    connectedSystems: {
      type: 'string',
      description: 'External systems and APIs the app integrates with',
    },
    redteamUser: {
      type: 'string',
      description: 'Typical user persona based on code analysis',
    },

    // Additional recon-specific fields
    entities: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Named entities relevant to testing (company names, product names, etc.)',
    },
    discoveredTools: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          file: { type: 'string' },
          parameters: { type: 'string' },
        },
        required: ['name', 'description', 'file', 'parameters'],
      },
      description: 'LLM tools/functions discovered in the codebase',
    },
    suggestedPlugins: {
      type: 'array',
      items: { type: 'string' },
      description: 'Recommended redteam plugins based on findings',
    },
    securityNotes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Security observations and potential vulnerabilities',
    },
    keyFiles: {
      type: 'array',
      items: { type: 'string' },
      description: 'Important files reviewed during analysis',
    },
  },
  required: [
    'purpose',
    'features',
    'industry',
    'systemPrompt',
    'hasAccessTo',
    'doesNotHaveAccessTo',
    'userTypes',
    'securityRequirements',
    'sensitiveDataTypes',
    'exampleIdentifiers',
    'criticalActions',
    'forbiddenTopics',
    'attackConstraints',
    'competitors',
    'connectedSystems',
    'redteamUser',
    'entities',
    'discoveredTools',
    'suggestedPlugins',
    'securityNotes',
    'keyFiles',
  ],
};
