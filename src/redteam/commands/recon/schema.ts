/**
 * JSON Schema for the recon output - used for structured output from the agent
 */
export const ReconOutputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    // Core ApplicationDefinition fields - NO FILE REFERENCES in these
    purpose: {
      type: 'string',
      description:
        'Main purpose of the application (1-3 sentences). Write naturally without file references.',
    },
    features: {
      type: 'string',
      description: 'Key features and capabilities the user can access. No file references.',
    },
    industry: {
      type: 'string',
      description: 'Industry/domain (e.g., healthcare, finance, automotive, customer service)',
    },
    systemPrompt: {
      type: 'string',
      description: 'The LLM system prompt if found (exact text, no file path needed)',
    },
    hasAccessTo: {
      type: 'string',
      description:
        'Data and capabilities the LLM can access (databases, APIs, tools). No file references.',
    },
    doesNotHaveAccessTo: {
      type: 'string',
      description: 'What the app explicitly cannot do or access. No file references.',
    },
    userTypes: {
      type: 'string',
      description:
        'User roles that interact with the app (customers, admins, etc.) and their permissions',
    },
    securityRequirements: {
      type: 'string',
      description: 'Compliance requirements (HIPAA, PCI, etc.) and security policies',
    },
    sensitiveDataTypes: {
      type: 'string',
      description: 'Types of sensitive data handled (PII, financial, health). NO actual values.',
    },
    exampleIdentifiers: {
      type: 'string',
      description: 'Data format examples (ID patterns, account formats) for realistic test data',
    },
    criticalActions: {
      type: 'string',
      description: 'High-risk operations: payments, data deletion, external API calls, etc.',
    },
    forbiddenTopics: {
      type: 'string',
      description: 'Topics the app should refuse: competitor endorsement, harmful content, etc.',
    },
    attackConstraints: {
      type: 'string',
      description: 'Guardrails and safety mechanisms that attackers must bypass',
    },
    competitors: {
      type: 'string',
      description: 'Competitor names the app should not endorse (for social engineering tests)',
    },
    connectedSystems: {
      type: 'string',
      description:
        'External tools/APIs the LLM can invoke (NOT internal architecture). E.g., "inventory database, payment API, scheduling system"',
    },
    redteamUser: {
      type: 'string',
      description:
        'Persona of actual app user (NOT security tester). E.g., "A customer shopping for a car" or "An employee checking benefits"',
    },

    // Additional recon-specific fields - file references OK here
    entities: {
      type: 'array',
      items: { type: 'string' },
      description: 'Company names, product names, people for realistic attack scenarios',
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
      description: 'LLM-callable tools/functions (attack vectors). File refs OK here.',
    },
    suggestedPlugins: {
      type: 'array',
      items: { type: 'string' },
      description: 'Recommended redteam plugins based on attack surface',
    },
    securityNotes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Internal notes on vulnerabilities. File references OK here.',
    },
    keyFiles: {
      type: 'array',
      items: { type: 'string' },
      description: 'Files reviewed during analysis',
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
