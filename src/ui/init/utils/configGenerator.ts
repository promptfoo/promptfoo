/**
 * Config Generator - Generate promptfoo configuration from wizard state.
 *
 * Creates YAML configuration files and prompt templates based on
 * the user's selections in the init wizard.
 */

import yaml from 'js-yaml';
import { getDefaultPlugins } from '../data/plugins';
import { getDefaultStrategies } from '../data/strategies';

import type {
  FileToWrite,
  InitContext,
  Language,
  PluginSelection,
  RedteamContext,
  SelectedProvider,
  UseCase,
} from '../machines/initMachine.types';

/**
 * Generate all files to write based on wizard context.
 */
export function generateFiles(context: InitContext): FileToWrite[] {
  const files: FileToWrite[] = [];

  // Handle redteam use case differently
  if (context.useCase === 'redteam') {
    return generateRedteamFiles(context);
  }

  // Generate main config file
  const configContent = generateConfig(context);
  files.push({
    path: `${context.outputDirectory}/promptfooconfig.yaml`,
    relativePath: 'promptfooconfig.yaml',
    content: configContent,
    exists: false,
    overwrite: true,
  });

  // Generate prompt files if prompts are defined
  if (context.prompts.length > 0) {
    for (const promptPath of context.prompts) {
      const promptContent = generatePromptContent(context.useCase, promptPath);
      files.push({
        path: `${context.outputDirectory}/${promptPath}`,
        relativePath: promptPath,
        content: promptContent,
        exists: false,
        overwrite: true,
      });
    }
  }

  // Generate test data file for RAG use case
  if (context.useCase === 'rag') {
    files.push({
      path: `${context.outputDirectory}/tests.yaml`,
      relativePath: 'tests.yaml',
      content: generateRagTestData(),
      exists: false,
      overwrite: true,
    });
  }

  // Generate tool definitions for agent use case
  if (context.useCase === 'agent') {
    const toolContent = generateToolDefinitions(context.language);
    const toolPath = context.language === 'python' ? 'tools.py' : 'tools.js';
    files.push({
      path: `${context.outputDirectory}/${toolPath}`,
      relativePath: toolPath,
      content: toolContent,
      exists: false,
      overwrite: true,
    });
  }

  // Generate README
  files.push({
    path: `${context.outputDirectory}/README.md`,
    relativePath: 'README.md',
    content: generateReadme(context),
    exists: false,
    overwrite: true,
  });

  return files;
}

/**
 * Generate files for redteam use case.
 */
function generateRedteamFiles(context: InitContext): FileToWrite[] {
  const files: FileToWrite[] = [];

  // Generate redteam config file
  const configContent = generateRedteamConfig(context.redteam);
  files.push({
    path: `${context.outputDirectory}/promptfooconfig.yaml`,
    relativePath: 'promptfooconfig.yaml',
    content: configContent,
    exists: false,
    overwrite: true,
  });

  // Generate README
  files.push({
    path: `${context.outputDirectory}/README.md`,
    relativePath: 'README.md',
    content: generateRedteamReadme(context.redteam),
    exists: false,
    overwrite: true,
  });

  return files;
}

/**
 * Generate redteam configuration YAML.
 */
export function generateRedteamConfig(redteam: RedteamContext): string {
  const config: Record<string, unknown> = {
    description: `Red Team Evaluation: ${redteam.targetLabel || 'LLM Application'}`,
  };

  // Generate prompt based on target type
  config.prompts = [generateRedteamPrompt(redteam)];

  // Generate target configuration
  config.targets = [generateRedteamTarget(redteam)];

  // Build redteam section
  const redteamSection: Record<string, unknown> = {};

  // Add purpose
  if (redteam.purpose) {
    redteamSection.purpose = redteam.purpose;
  }

  // Add num tests
  if (redteam.numTests && redteam.numTests !== 5) {
    redteamSection.numTests = redteam.numTests;
  }

  // Add plugins
  const plugins = getRedteamPlugins(redteam);
  if (plugins.length > 0) {
    redteamSection.plugins = plugins;
  }

  // Add strategies
  const strategies = getRedteamStrategies(redteam);
  if (strategies.length > 0) {
    redteamSection.strategies = strategies;
  }

  config.redteam = redteamSection;

  return yaml.dump(config, {
    indent: 2,
    lineWidth: 120,
    quotingType: '"',
    forceQuotes: false,
  });
}

/**
 * Generate prompt for redteam based on target type.
 */
function generateRedteamPrompt(redteam: RedteamContext): string {
  switch (redteam.targetType) {
    case 'http_endpoint':
      return '{{prompt}}';
    case 'rag':
      return 'Based on the available context, respond to: {{prompt}}';
    case 'agent':
      return 'Process this request: {{prompt}}';
    case 'prompt_model_chatbot':
    default:
      return 'Respond to the user input: {{prompt}}';
  }
}

/**
 * Generate target configuration for redteam.
 */
function generateRedteamTarget(redteam: RedteamContext): Record<string, unknown> {
  const target: Record<string, unknown> = {};

  switch (redteam.targetType) {
    case 'http_endpoint':
      target.id = 'http';
      target.config = {
        url: 'http://localhost:3000/api/chat',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: {
          message: '{{prompt}}',
        },
      };
      break;

    case 'rag':
    case 'agent':
    case 'prompt_model_chatbot':
    default:
      target.id = 'openai:gpt-4o-mini';
      break;
  }

  // Add label
  target.label = redteam.targetLabel || 'target';

  return target;
}

/**
 * Get plugins for redteam config.
 */
function getRedteamPlugins(redteam: RedteamContext): (string | Record<string, unknown>)[] {
  // Use selected plugins or defaults
  const plugins: PluginSelection[] =
    redteam.pluginConfigMode === 'manual' && redteam.plugins.length > 0
      ? redteam.plugins
      : getDefaultPlugins().map((id) => ({ id }));

  return plugins.map((plugin) => {
    if (plugin.config && Object.keys(plugin.config).length > 0) {
      return {
        id: plugin.id,
        config: plugin.config,
      };
    }
    return plugin.id;
  });
}

/**
 * Get strategies for redteam config.
 */
function getRedteamStrategies(redteam: RedteamContext): string[] {
  // Use selected strategies or defaults
  if (redteam.strategyConfigMode === 'manual' && redteam.strategies.length > 0) {
    return redteam.strategies;
  }
  return getDefaultStrategies();
}

/**
 * Generate README for redteam project.
 */
function generateRedteamReadme(redteam: RedteamContext): string {
  return `# Red Team Evaluation: ${redteam.targetLabel || 'LLM Application'}

This project was generated by \`promptfoo init\` for red team security testing.

## Overview

${redteam.purpose || 'Security and safety evaluation for an LLM application.'}

## Getting Started

1. **Set up your API keys**

   \`\`\`bash
   export OPENAI_API_KEY=your-key
   # Add other provider keys as needed
   \`\`\`

2. **Generate test cases**

   \`\`\`bash
   promptfoo redteam generate
   \`\`\`

3. **Run the evaluation**

   \`\`\`bash
   promptfoo redteam eval
   \`\`\`

4. **View the results**

   \`\`\`bash
   promptfoo redteam report
   \`\`\`

## Configuration

- **Config file**: \`promptfooconfig.yaml\`
- **Target**: ${redteam.targetLabel || 'LLM application'}
- **Target type**: ${redteam.targetType || 'prompt_model_chatbot'}

## Plugins

The following vulnerability categories are being tested:

${
  redteam.plugins.length > 0
    ? redteam.plugins.map((p) => `- ${p.id}`).join('\n')
    : getDefaultPlugins()
        .map((id) => `- ${id}`)
        .join('\n')
}

## Strategies

The following attack strategies are configured:

${
  redteam.strategies.length > 0
    ? redteam.strategies.map((s) => `- ${s}`).join('\n')
    : getDefaultStrategies()
        .map((s) => `- ${s}`)
        .join('\n')
}

## Learn More

- [Red Team Documentation](https://www.promptfoo.dev/docs/red-team/)
- [Plugin Reference](https://www.promptfoo.dev/docs/red-team/plugins/)
- [Strategy Reference](https://www.promptfoo.dev/docs/red-team/strategies/)
`;
}

/**
 * Generate the main promptfoo configuration.
 */
export function generateConfig(context: InitContext): string {
  const config: Record<string, unknown> = {
    description: getConfigDescription(context.useCase),
  };

  // Add prompts
  if (context.prompts.length > 0) {
    config.prompts = context.prompts;
  } else {
    config.prompts = [getDefaultPrompt(context.useCase)];
  }

  // Add providers
  config.providers = generateProviderConfig(context.providers);

  // Add tests based on use case
  config.tests = generateTestConfig(context.useCase);

  // Add default test options
  const defaultTest: Record<string, unknown> = {
    options: {
      transformVars: 'JSON.parse(JSON.stringify(vars))',
    },
  };

  // Add assertions for specific use cases
  if (context.useCase === 'rag') {
    defaultTest.assert = [
      { type: 'factuality', value: '{{expected}}' },
      { type: 'context-relevance', threshold: 0.8 },
      { type: 'answer-relevance', threshold: 0.8 },
    ];
  }

  config.defaultTest = defaultTest;

  return yaml.dump(config, {
    indent: 2,
    lineWidth: 120,
    quotingType: '"',
    forceQuotes: false,
  });
}

/**
 * Get description based on use case.
 */
function getConfigDescription(useCase: UseCase | null): string {
  switch (useCase) {
    case 'compare':
      return 'Compare LLM outputs across different providers';
    case 'rag':
      return 'Evaluate RAG pipeline quality';
    case 'agent':
      return 'Test AI agent tool use and reasoning';
    case 'redteam':
      return 'Security and safety testing for LLM application';
    default:
      return 'Promptfoo evaluation configuration';
  }
}

/**
 * Get default prompt based on use case.
 */
function getDefaultPrompt(useCase: UseCase | null): string {
  switch (useCase) {
    case 'compare':
      return 'Answer the following question concisely:\n\n{{question}}';
    case 'rag':
      return 'Based on the following context, answer the question.\n\nContext:\n{{context}}\n\nQuestion: {{question}}';
    case 'agent':
      return 'You are a helpful assistant with access to tools. Use them when needed.\n\nUser request: {{request}}';
    default:
      return 'You are a helpful assistant.\n\n{{input}}';
  }
}

/**
 * Generate provider configuration from selected providers.
 */
function generateProviderConfig(providers: SelectedProvider[]): string[] {
  const providerStrings: string[] = [];

  for (const provider of providers) {
    for (const modelId of provider.models) {
      providerStrings.push(modelId);
    }
  }

  return providerStrings;
}

/**
 * Generate test configuration based on use case.
 */
function generateTestConfig(useCase: UseCase | null): Record<string, unknown>[] {
  switch (useCase) {
    case 'compare':
      return [
        {
          vars: { question: 'What is the capital of France?' },
          assert: [{ type: 'contains', value: 'Paris' }],
        },
        {
          vars: { question: 'Explain quantum computing in simple terms.' },
          assert: [
            { type: 'llm-rubric', value: 'Response should be understandable by a non-expert' },
          ],
        },
        {
          vars: { question: 'Write a haiku about programming.' },
          assert: [
            { type: 'llm-rubric', value: 'Response should be a valid haiku (5-7-5 syllables)' },
          ],
        },
      ];

    case 'rag':
      return [
        {
          vars: {
            context: 'The Eiffel Tower is located in Paris, France. It was built in 1889.',
            question: 'When was the Eiffel Tower built?',
            expected: 'The Eiffel Tower was built in 1889.',
          },
        },
        {
          vars: {
            context: 'Python was created by Guido van Rossum and released in 1991.',
            question: 'Who created Python?',
            expected: 'Python was created by Guido van Rossum.',
          },
        },
      ];

    case 'agent':
      return [
        {
          vars: { request: 'What is the current weather in San Francisco?' },
          assert: [{ type: 'is-valid-tool-call' }, { type: 'contains', value: 'weather' }],
        },
        {
          vars: { request: 'Search for the latest news about AI' },
          assert: [{ type: 'is-valid-tool-call' }],
        },
      ];

    default:
      return [
        {
          vars: { input: 'Hello, how are you?' },
          assert: [{ type: 'llm-rubric', value: 'Response should be friendly and helpful' }],
        },
      ];
  }
}

/**
 * Generate prompt file content.
 */
function generatePromptContent(useCase: UseCase | null, filename: string): string {
  const isSystemPrompt = filename.includes('system');

  if (isSystemPrompt) {
    return generateSystemPrompt(useCase);
  }

  return generateUserPrompt(useCase);
}

/**
 * Generate system prompt content.
 */
function generateSystemPrompt(useCase: UseCase | null): string {
  switch (useCase) {
    case 'rag':
      return `You are a helpful assistant that answers questions based on provided context.
Always cite your sources when possible.
If the context doesn't contain relevant information, say so.`;

    case 'agent':
      return `You are an AI assistant with access to various tools.
Use tools when they can help answer the user's request.
Think step by step before taking actions.`;

    default:
      return `You are a helpful, harmless, and honest assistant.
Provide clear and accurate responses.`;
  }
}

/**
 * Generate user prompt content.
 */
function generateUserPrompt(useCase: UseCase | null): string {
  switch (useCase) {
    case 'rag':
      return `Context:
{{context}}

Question: {{question}}`;

    case 'agent':
      return `{{request}}`;

    default:
      return `{{input}}`;
  }
}

/**
 * Generate RAG test data file.
 */
function generateRagTestData(): string {
  const testData = [
    {
      context:
        'The Great Wall of China is over 13,000 miles long. It was built over many centuries, starting in the 7th century BC.',
      question: 'How long is the Great Wall of China?',
      expected: 'The Great Wall of China is over 13,000 miles long.',
    },
    {
      context: 'JavaScript was created by Brendan Eich in 1995 while working at Netscape.',
      question: 'When was JavaScript created?',
      expected: 'JavaScript was created in 1995.',
    },
    {
      context:
        'Mount Everest is the tallest mountain on Earth, standing at 29,032 feet (8,849 meters) above sea level.',
      question: 'What is the height of Mount Everest?',
      expected: 'Mount Everest is 29,032 feet or 8,849 meters tall.',
    },
  ];

  return yaml.dump(testData, { indent: 2 });
}

/**
 * Generate tool definitions for agent use case.
 */
function generateToolDefinitions(language: Language | null): string {
  if (language === 'python') {
    return `"""
Tool definitions for the AI agent.

These tools can be called by the LLM to perform actions.
"""

def get_weather(location: str) -> dict:
    """Get the current weather for a location.

    Args:
        location: The city and state/country

    Returns:
        Weather data including temperature, conditions, etc.
    """
    # TODO: Implement actual weather API call
    return {
        "location": location,
        "temperature": 72,
        "conditions": "sunny",
        "humidity": 45
    }


def search_web(query: str) -> list:
    """Search the web for information.

    Args:
        query: The search query

    Returns:
        List of search results
    """
    # TODO: Implement actual search API call
    return [
        {"title": f"Result for: {query}", "snippet": "Example search result..."}
    ]


def calculate(expression: str) -> float:
    """Evaluate a mathematical expression.

    Args:
        expression: A mathematical expression (e.g., "2 + 2")

    Returns:
        The result of the calculation
    """
    # WARNING: eval is used here for simplicity, use a proper math parser in production
    return eval(expression)


# Tool definitions for the LLM
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get the current weather for a location",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "The city and state/country, e.g., 'San Francisco, CA'"
                    }
                },
                "required": ["location"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_web",
            "description": "Search the web for information",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query"
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "calculate",
            "description": "Evaluate a mathematical expression",
            "parameters": {
                "type": "object",
                "properties": {
                    "expression": {
                        "type": "string",
                        "description": "A mathematical expression, e.g., '2 + 2'"
                    }
                },
                "required": ["expression"]
            }
        }
    }
]
`;
  }

  // JavaScript/TypeScript
  return `/**
 * Tool definitions for the AI agent.
 *
 * These tools can be called by the LLM to perform actions.
 */

/**
 * Get the current weather for a location.
 * @param {string} location - The city and state/country
 * @returns {object} Weather data
 */
function getWeather(location) {
  // TODO: Implement actual weather API call
  return {
    location,
    temperature: 72,
    conditions: 'sunny',
    humidity: 45,
  };
}

/**
 * Search the web for information.
 * @param {string} query - The search query
 * @returns {Array} Search results
 */
function searchWeb(query) {
  // TODO: Implement actual search API call
  return [
    { title: \`Result for: \${query}\`, snippet: 'Example search result...' },
  ];
}

/**
 * Evaluate a mathematical expression.
 * @param {string} expression - A mathematical expression
 * @returns {number} The result
 */
function calculate(expression) {
  // WARNING: eval is used here for simplicity, use a proper math parser in production
  return eval(expression);
}

// Tool definitions for the LLM
const tools = [
  {
    type: 'function',
    function: {
      name: 'getWeather',
      description: 'Get the current weather for a location',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: "The city and state/country, e.g., 'San Francisco, CA'",
          },
        },
        required: ['location'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'searchWeb',
      description: 'Search the web for information',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate',
      description: 'Evaluate a mathematical expression',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: "A mathematical expression, e.g., '2 + 2'",
          },
        },
        required: ['expression'],
      },
    },
  },
];

module.exports = { getWeather, searchWeb, calculate, tools };
`;
}

/**
 * Generate README file.
 */
function generateReadme(context: InitContext): string {
  const useCaseTitle = getUseCaseTitle(context.useCase);
  const providerList = context.providers.flatMap((p) => p.models).join(', ');

  return `# ${useCaseTitle}

This project was generated by \`promptfoo init\`.

## Getting Started

1. **Set up your API keys**

   \`\`\`bash
   export OPENAI_API_KEY=your-key
   export ANTHROPIC_API_KEY=your-key
   # Add other provider keys as needed
   \`\`\`

2. **Run the evaluation**

   \`\`\`bash
   promptfoo eval
   \`\`\`

3. **View the results**

   \`\`\`bash
   promptfoo view
   \`\`\`

## Configuration

- **Config file**: \`promptfooconfig.yaml\`
- **Providers**: ${providerList || 'Configure your providers in the config file'}

## Learn More

- [Promptfoo Documentation](https://www.promptfoo.dev/docs/intro)
- [Configuration Reference](https://www.promptfoo.dev/docs/configuration/reference)
- [Assertion Types](https://www.promptfoo.dev/docs/configuration/expected-outputs)
`;
}

/**
 * Get a human-readable title for the use case.
 */
function getUseCaseTitle(useCase: UseCase | null): string {
  switch (useCase) {
    case 'compare':
      return 'LLM Comparison Project';
    case 'rag':
      return 'RAG Evaluation Project';
    case 'agent':
      return 'AI Agent Testing Project';
    case 'redteam':
      return 'Security Testing Project';
    default:
      return 'Promptfoo Project';
  }
}
