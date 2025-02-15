import checkbox from '@inquirer/checkbox';
import confirm from '@inquirer/confirm';
import { ExitPromptError } from '@inquirer/core';
import select from '@inquirer/select';
import chalk from 'chalk';
import dedent from 'dedent';
import fs from 'fs';
import path from 'path';
import { getEnvString } from './envars';
import logger from './logger';
import { redteamInit } from './redteam/commands/init';
import telemetry, { type EventProperties } from './telemetry';
import type { EnvOverrides } from './types/env';
import { isRunningUnderNpx } from './util';
import { getNunjucksEngine } from './util/templates';

export const CONFIG_TEMPLATE = `# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json

# Learn more about building a configuration: https://promptfoo.dev/docs/configuration/guide

description: "My eval"

prompts:
  {% for prompt in prompts -%}
  - {{prompt | dump }}
  {% endfor %}

providers:
  {% for provider in providers -%}
  - {{provider | dump }}
  {% endfor %}

tests:
{%- if type == 'rag' or type == 'agent' %}
  - vars:
      inquiry: "I have a problem with my order"
      {% if language == 'python' -%}
      context: file://context.py
      {%- elif language == 'javascript' -%}
      context: file://context.js
      {%- else -%}
      context: file://context.py
      {%- endif %}

  - vars:
      inquiry: "I want to return my widget"
      # See how to use dynamic context to e.g. use a vector store https://promptfoo.dev/docs/guides/evaluate-rag/#using-dynamic-context
      {% if language == 'javascript' -%}
      context: file://context.js
      {%- else -%}
      context: file://context.py
      {%- endif %}
    assert:
      # For more information on assertions, see https://promptfoo.dev/docs/configuration/expected-outputs

      # Make sure output contains the phrase "return label"
      - type: icontains
        value: "return label"

      # Prefer shorter outputs
      {% if language == 'python' -%}
      - type: python
        value: 1 / (len(output) + 1)
      {%- else -%}
      - type: javascript
        value: 1 / (output.length + 1)
      {%- endif %}

  - vars:
      inquiry: "I need help with my account"
      context: |
        You can also hardcode context directly in the configuration.
        Username: Foobar
        Account ID: 123456
    assert:
      # For more information on model-graded evals, see https://promptfoo.dev/docs/configuration/expected-outputs/model-graded
      - type: llm-rubric
        value: ensure that the output is friendly and empathetic
{%- else %}
  - vars:
      topic: bananas

  - vars:
      topic: avocado toast
    assert:
      # For more information on assertions, see https://promptfoo.dev/docs/configuration/expected-outputs

      # Make sure output contains the word "avocado"
      - type: icontains
        value: avocado

      # Prefer shorter outputs
      - type: javascript
        value: 1 / (output.length + 1)

  - vars:
      topic: new york city
    assert:
      # For more information on model-graded evals, see https://promptfoo.dev/docs/configuration/expected-outputs/model-graded
      - type: llm-rubric
        value: ensure that the output is funny
{% endif %}
`;

export const PYTHON_PROVIDER = `# Learn more about building a Python provider: https://promptfoo.dev/docs/providers/python/
import json

def call_api(prompt, options, context):
    # The 'options' parameter contains additional configuration for the API call.
    config = options.get('config', None)
    additional_option = config.get('additionalOption', None)

    # The 'context' parameter provides info about which vars were used to create the final prompt.
    user_variable = context['vars'].get('userVariable', None)

    # The prompt is the final prompt string after the variables have been processed.
    # Custom logic to process the prompt goes here.
    # For instance, you might call an external API or run some computations.
    # TODO: Replace with actual LLM API implementation.
    def call_llm(prompt):
        return f"Stub response for prompt: {prompt}"
    output = call_llm(prompt)

    # The result should be a dictionary with at least an 'output' field.
    result = {
        "output": output,
    }

    if some_error_condition:
        result['error'] = "An error occurred during processing"

    if token_usage_calculated:
        # If you want to report token usage, you can set the 'tokenUsage' field.
        result['tokenUsage'] = {"total": token_count, "prompt": prompt_token_count, "completion": completion_token_count}

    if failed_guardrails:
        # If guardrails triggered, you can set the 'guardrails' field.
        result['guardrails'] = {"flagged": True}

    return result
`;

export const JAVASCRIPT_PROVIDER = `// Learn more about building a JavaScript provider: https://promptfoo.dev/docs/providers/custom-api
// customApiProvider.js

class CustomApiProvider {
  constructor(options) {
    // Provider ID can be overridden by the config file (e.g. when using multiple of the same provider)
    this.providerId = options.id || 'custom provider';

    // options.config contains any custom options passed to the provider
    this.config = options.config;
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, context) {
    // Add your custom API logic here
    // Use options like: \`this.config.temperature\`, \`this.config.max_tokens\`, etc.

    console.log('Vars for this test case:', JSON.stringify(context.vars));

    return {
      // Required
      output: 'Model output',

      // Optional
      tokenUsage: {
        total: 10,
        prompt: 5,
        completion: 5,
      },
    };
  }
}

module.exports = CustomApiProvider;
`;

export const BASH_PROVIDER = `# Learn more about building any generic provider: https://promptfoo.dev/docs/providers/custom-script

# Anything printed to standard output will be captured as the output of the provider

echo "This is the LLM output"

# You can also call external scripts or executables
php my_script.php
`;

export const PYTHON_VAR = `# Learn more about using dynamic variables: https://promptfoo.dev/docs/configuration/guide/#import-vars-from-separate-files
def get_var(var_name, prompt, other_vars):
    # This is where you can fetch documents from a database, call an API, etc.
    # ...

    if var_name == 'context':
        # Return value based on the variable name and test context
        return {
            'output': f"... Documents for {other_vars['inquiry']} in prompt: {prompt} ..."
        }

    # Default variable value
    return {'output': 'Document A, Document B, Document C, ...'}

    # Handle potential errors
    # return { 'error': 'Error message' }
`;

export const JAVASCRIPT_VAR = `// Learn more about using dynamic variables: https://promptfoo.dev/docs/configuration/guide/#import-vars-from-separate-files
module.exports = function (varName, prompt, otherVars) {
  // This is where you can fetch documents from a database, call an API, etc.
  // ...

  if (varName === 'context') {
    // Return value based on the variable name and test context
    return {
      output: \`... Documents for \${otherVars.inquiry} for prompt: \${prompt} ...\`
    };
  }

  // Default variable value
  return {
    output: 'Document A, Document B, Document C, ...',
  };

  // Handle potential errors
  // return { error: 'Error message' }
};
`;

export const DEFAULT_README = `To get started, set your OPENAI_API_KEY environment variable, or other required keys for the providers you selected.

Next, edit promptfooconfig.yaml.

Then run:
\`\`\`
promptfoo eval
\`\`\`

Afterwards, you can view the results by running \`promptfoo view\`
`;

function recordOnboardingStep(step: string, properties: EventProperties = {}) {
  telemetry.recordAndSend('funnel', {
    type: 'eval onboarding',
    step,
    ...properties,
  });
}

/**
 * Iterate through user choices and determine if the user has selected a provider that needs an API key
 * but has not set and API key in their environment.
 */
export function reportProviderAPIKeyWarnings(providerChoices: (string | object)[]): string[] {
  const ids = providerChoices.map((c) => (typeof c === 'object' ? (c as any).id : c));

  const map: Record<string, keyof EnvOverrides> = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
  };

  return Object.entries(map)
    .filter(([prefix, key]) => ids.some((id) => id.startsWith(prefix)) && !getEnvString(key))
    .map(
      ([prefix, key]) => dedent`
    ${chalk.bold(`Warning: ${key} environment variable is not set.`)}
    Please set this environment variable like: export ${key}=<my-api-key>
  `,
    );
}

async function askForPermissionToOverwrite({
  absolutePath,
  relativePath,
  required,
}: {
  absolutePath: string;
  relativePath: string;
  required: boolean;
}): Promise<boolean> {
  if (!fs.existsSync(absolutePath)) {
    return true;
  }

  const requiredText = required ? '(required)' : '(optional)';
  const hasPermissionToWrite = await confirm({
    message: `${relativePath} ${requiredText} already exists. Do you want to overwrite it?`,
    default: false,
  });

  if (required && !hasPermissionToWrite) {
    throw new Error(`User did not grant permission to overwrite ${relativePath}`);
  }

  return hasPermissionToWrite;
}

export async function createDummyFiles(directory: string | null, interactive: boolean = true) {
  console.clear();
  const outDirectory = directory || '.';
  const outDirAbsolute = path.join(process.cwd(), outDirectory);

  async function writeFile({
    file,
    contents,
    required,
  }: {
    file: string;
    contents: string;
    required: boolean;
  }) {
    const relativePath = path.join(outDirectory, file);
    const absolutePath = path.join(outDirAbsolute, file);

    if (interactive) {
      const hasPermissionToWrite = await askForPermissionToOverwrite({
        absolutePath,
        relativePath,
        required,
      });

      if (!hasPermissionToWrite) {
        logger.info(`⏩ Skipping ${relativePath}`);
        return;
      }
    }

    fs.writeFileSync(absolutePath, contents);
    logger.info(`⌛ Wrote ${relativePath}`);
  }

  const prompts: string[] = [];
  const providers: (string | object)[] = [];
  let action: string;
  let language: string;

  if (!fs.existsSync(outDirAbsolute)) {
    fs.mkdirSync(outDirAbsolute, { recursive: true });
  }

  if (interactive) {
    recordOnboardingStep('start');

    // Choose use case
    action = await select({
      message: 'What would you like to do?',
      choices: [
        { name: 'Not sure yet', value: 'compare' },
        { name: 'Improve prompt and model performance', value: 'compare' },
        { name: 'Improve RAG performance', value: 'rag' },
        { name: 'Improve agent/chain of thought performance', value: 'agent' },
        { name: 'Run a red team evaluation', value: 'redteam' },
      ],
    });

    recordOnboardingStep('choose app type', {
      value: action,
    });

    if (action === 'redteam') {
      await redteamInit(outDirectory);
      return {
        numPrompts: 0,
        providerPrefixes: [],
        action: 'redteam',
        language: 'not_applicable',
      };
    }

    language = 'not_sure';
    if (action === 'rag' || action === 'agent') {
      language = await select({
        message: 'What programming language are you developing the app in?',
        choices: [
          { name: 'Not sure yet', value: 'not_sure' },
          { name: 'Python', value: 'python' },
          { name: 'Javascript', value: 'javascript' },
        ],
      });

      recordOnboardingStep('choose language', {
        value: language,
      });
    }

    const choices: { name: string; value: (string | object)[] }[] = [
      { name: `I'll choose later`, value: ['openai:gpt-4o-mini', 'openai:gpt-4o'] },
      {
        name: '[OpenAI] GPT 4o, GPT 4o-mini, GPT-3.5, ...',
        value:
          action === 'agent'
            ? [
                {
                  id: 'openai:gpt-4o',
                  config: {
                    tools: [
                      {
                        type: 'function',
                        function: {
                          name: 'get_current_weather',
                          description: 'Get the current weather in a given location',
                          parameters: {
                            type: 'object',
                            properties: {
                              location: {
                                type: 'string',
                                description: 'The city and state, e.g. San Francisco, CA',
                              },
                            },
                            required: ['location'],
                          },
                        },
                      },
                    ],
                  },
                },
              ]
            : ['openai:gpt-4o-mini', 'openai:gpt-4o'],
      },
      {
        name: '[Anthropic] Claude Opus, Sonnet, Haiku, ...',
        value: [
          'anthropic:messages:claude-3-5-sonnet-20241022',
          'anthropic:messages:claude-3-5-haiku-20241022',
        ],
      },
      {
        name: '[HuggingFace] Llama, Phi, Gemma, ...',
        value: [
          'huggingface:text-generation:meta-llama/Meta-Llama-3-8B-Instruct',
          'huggingface:text-generation:microsoft/Phi-3-mini-4k-instruct',
          'huggingface:text-generation:google/gemma-2b-it',
        ],
      },
      {
        name: 'Local Python script',
        value: ['file://provider.py'],
      },
      {
        name: 'Local Javascript script',
        value: ['file://provider.js'],
      },
      {
        name: 'Local executable',
        value: ['exec:provider.sh'],
      },
      {
        name: 'HTTP endpoint',
        value: ['https://example.com/api/generate'],
      },
      {
        name: '[AWS Bedrock] Claude, Llama, Titan, ...',
        value: [
          'bedrock:anthropic.claude-3-haiku-20240307-v1:0',
          'bedrock:anthropic.claude-3-opus-20240307-v1:0',
        ],
      },
      {
        name: '[Cohere] Command R, Command R+, ...',
        value: ['cohere:command-r', 'cohere:command-r-plus'],
      },
      { name: '[Google] Gemini Pro, Gemini Ultra, ...', value: ['vertex:gemini-pro'] },
      {
        name: '[Ollama] Llama 3, Mixtral, ...',
        value: ['ollama:chat:llama3', 'ollama:chat:mixtral:8x22b'],
      },
      {
        name: '[WatsonX] Llama 3.2, IBM Granite, ...',
        value: [
          'watsonx:meta-llama/llama-3-2-11b-vision-instruct',
          'watsonx:ibm/granite-13b-chat-v2',
        ],
      },
    ];

    /**
     * The potential of the object type here is given by the agent action conditional
     * for openai as a value choice
     */
    const providerChoices: (string | object)[] = (
      await checkbox({
        message: 'Which model providers would you like to use?',
        choices,
        loop: false,
        pageSize: process.stdout.rows - 6,
      })
    ).flat();

    recordOnboardingStep('choose providers', {
      value: providerChoices.map((choice) =>
        typeof choice === 'string' ? choice : JSON.stringify(choice),
      ),
    });

    // Tell the user if they have providers selected without relevant API keys set in env.
    reportProviderAPIKeyWarnings(providerChoices).forEach((warningText) =>
      logger.warn(warningText),
    );

    if (providerChoices.length > 0) {
      if (providerChoices.length > 3) {
        providers.push(
          ...providerChoices.map((choice) => (Array.isArray(choice) ? choice[0] : choice)),
        );
      } else {
        providers.push(...providerChoices);
      }

      if (
        providerChoices.some(
          (choice) =>
            typeof choice === 'string' && choice.startsWith('file://') && choice.endsWith('.js'),
        )
      ) {
        await writeFile({
          file: 'provider.js',
          contents: JAVASCRIPT_PROVIDER,
          required: true,
        });
      }
      if (
        providerChoices.some((choice) => typeof choice === 'string' && choice.startsWith('exec:'))
      ) {
        await writeFile({
          file: 'provider.sh',
          contents: BASH_PROVIDER,
          required: true,
        });
      }
      if (
        providerChoices.some(
          (choice) =>
            typeof choice === 'string' &&
            (choice.startsWith('python:') ||
              (choice.startsWith('file://') && choice.endsWith('.py'))),
        )
      ) {
        await writeFile({
          file: 'provider.py',
          contents: PYTHON_PROVIDER,
          required: true,
        });
      }
    } else {
      providers.push('openai:gpt-4o-mini');
      providers.push('openai:gpt-4o');
    }

    if (action === 'compare') {
      prompts.push(`Write a tweet about {{topic}}`);
      if (providers.length < 3) {
        prompts.push(`Write a concise, funny tweet about {{topic}}`);
      }
    } else if (action === 'rag') {
      prompts.push(
        'Write a customer service response to:\n\n{{inquiry}}\n\nUse these documents:\n\n{{context}}',
      );
    } else if (action === 'agent') {
      prompts.push(`Fulfill this user helpdesk ticket: {{inquiry}}`);
    }

    if (action === 'rag' || action === 'agent') {
      if (language === 'javascript') {
        await writeFile({
          file: 'context.js',
          contents: JAVASCRIPT_VAR,
          required: true,
        });
      } else {
        await writeFile({
          file: 'context.py',
          contents: PYTHON_VAR,
          required: true,
        });
      }
    }

    recordOnboardingStep('complete');
  } else {
    action = 'compare';
    language = 'not_sure';
    prompts.push(`Write a tweet about {{topic}}`);
    prompts.push(`Write a concise, funny tweet about {{topic}}`);
    providers.push('openai:gpt-4o-mini');
    providers.push('openai:gpt-4o');
  }

  const nunjucks = getNunjucksEngine();
  const config = nunjucks.renderString(CONFIG_TEMPLATE, {
    prompts,
    providers,
    type: action,
    language,
  });

  await writeFile({
    file: 'README.md',
    contents: DEFAULT_README,
    required: false,
  });

  await writeFile({
    file: 'promptfooconfig.yaml',
    contents: config,
    required: true,
  });

  return {
    numPrompts: prompts.length,
    providerPrefixes: providers.map((p) => (typeof p === 'string' ? p.split(':')[0] : 'unknown')),
    action,
    language,
    outDirectory,
  };
}

export async function initializeProject(directory: string | null, interactive: boolean = true) {
  try {
    const result = await createDummyFiles(directory, interactive);
    const { outDirectory, ...telemetryDetails } = result;

    const runCommand = isRunningUnderNpx() ? 'npx promptfoo eval' : 'promptfoo eval';

    if (outDirectory === '.') {
      logger.info(chalk.green(`✅ Run \`${chalk.bold(runCommand)}\` to get started!`));
    } else {
      logger.info(`✅ Wrote promptfooconfig.yaml to ./${outDirectory}`);
      logger.info(
        chalk.green(
          `Run \`${chalk.bold(`cd ${outDirectory}`)}\` and then \`${chalk.bold(
            runCommand,
          )}\` to get started!`,
        ),
      );
    }

    return telemetryDetails;
  } catch (err) {
    if (err instanceof ExitPromptError) {
      const runCommand = isRunningUnderNpx() ? 'npx promptfoo@latest init' : 'promptfoo init';
      logger.info(
        '\n' +
          chalk.blue('Initialization paused. To continue setup later, use the command: ') +
          chalk.bold(runCommand),
      );
      logger.info(
        chalk.blue('For help or feedback, visit ') +
          chalk.green('https://www.promptfoo.dev/contact/'),
      );
      await recordOnboardingStep('early exit');
      process.exit(130);
    } else {
      throw err;
    }
  }
}
