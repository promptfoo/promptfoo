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
import telemetry, { type EventValue } from './telemetry';
import type { EnvOverrides } from './types';
import { getNunjucksEngine } from './util/templates';

export const CONFIG_TEMPLATE = `# Learn more about building a configuration: https://promptfoo.dev/docs/configuration/guide
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

    return result
`;

export const JAVASCRIPT_PROVIDER = `// Learn more about building a JavaScript provider: https://promptfoo.dev/docs/providers/custom-api
// customApiProvider.js
import fetch from 'node-fetch';

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

function recordOnboardingStep(step: string, properties: Record<string, EventValue> = {}) {
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

export async function createDummyFiles(directory: string | null, interactive: boolean = true) {
  console.clear();

  if (directory && !fs.existsSync(directory)) {
    fs.mkdirSync(directory);
  }

  directory = directory || '.';

  // Check for existing files and prompt for overwrite
  const filesToCheck = ['promptfooconfig.yaml', 'README.md'];
  const existingFiles = filesToCheck.filter((file) =>
    fs.existsSync(path.join(process.cwd(), directory, file)),
  );

  if (existingFiles.length > 0) {
    const fileList = existingFiles.join(' and ');
    const overwrite = await confirm({
      message: `${fileList} already exist${existingFiles.length > 1 ? '' : 's'}${directory === '.' ? '' : ` in ${directory}`}. Do you want to overwrite ${existingFiles.length > 1 ? 'them' : 'it'}?`,
      default: false,
    });
    if (!overwrite) {
      const isNpx = getEnvString('npm_execpath')?.includes('npx');
      const runCommand = isNpx ? 'npx promptfoo@latest init' : 'promptfoo init';
      logger.info(
        chalk.red(
          `Please run \`${runCommand}\` in a different directory or use \`${runCommand} <directory>\` to specify a new location.`,
        ),
      );
      process.exit(1);
    }
  }

  // Rest of the onboarding flow
  const prompts: string[] = [];
  const providers: (string | object)[] = [];
  let action: string;
  let language: string;

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
      await redteamInit(directory || '.');
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
          'anthropic:messages:claude-3-5-sonnet-20240620',
          'anthropic:messages:claude-3-opus-20240307',
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
        value: ['python:provider.py'],
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
        providerChoices.some((choice) => typeof choice === 'string' && choice.startsWith('file://'))
      ) {
        fs.writeFileSync(path.join(process.cwd(), directory, 'provider.js'), JAVASCRIPT_PROVIDER);
        logger.info('⌛ Wrote provider.js');
      }
      if (
        providerChoices.some((choice) => typeof choice === 'string' && choice.startsWith('exec:'))
      ) {
        fs.writeFileSync(path.join(process.cwd(), directory, 'provider.sh'), BASH_PROVIDER);
        logger.info('⌛ Wrote provider.sh');
      }
      if (
        providerChoices.some((choice) => typeof choice === 'string' && choice.startsWith('python:'))
      ) {
        fs.writeFileSync(path.join(process.cwd(), directory, 'provider.py'), PYTHON_PROVIDER);
        logger.info('⌛ Wrote provider.py');
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
        fs.writeFileSync(path.join(process.cwd(), directory, 'context.js'), JAVASCRIPT_VAR);
        logger.info('⌛ Wrote context.js');
      } else {
        fs.writeFileSync(path.join(process.cwd(), directory, 'context.py'), PYTHON_VAR);
        logger.info('⌛ Wrote context.py');
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

  fs.writeFileSync(path.join(process.cwd(), directory, 'promptfooconfig.yaml'), config);
  fs.writeFileSync(path.join(process.cwd(), directory, 'README.md'), DEFAULT_README);

  const isNpx = getEnvString('npm_execpath')?.includes('npx');
  const runCommand = isNpx ? 'npx promptfoo@latest eval' : 'promptfoo eval';
  if (directory === '.') {
    logger.info(
      chalk.green(
        `✅ Wrote promptfooconfig.yaml. Run \`${chalk.bold(runCommand)}\` to get started!`,
      ),
    );
  } else {
    logger.info(`✅ Wrote promptfooconfig.yaml to ./${directory}`);
    logger.info(
      chalk.green(
        `Run \`${chalk.bold(`cd ${directory}`)}\` and then \`${chalk.bold(
          runCommand,
        )}\` to get started!`,
      ),
    );
  }

  return {
    numPrompts: prompts.length,
    providerPrefixes: providers.map((p) => (typeof p === 'string' ? p.split(':')[0] : 'unknown')),
    action,
    language,
  };
}

export async function initializeProject(directory: string | null, interactive: boolean = true) {
  try {
    return await createDummyFiles(directory, interactive);
  } catch (err) {
    if (err instanceof ExitPromptError) {
      const isNpx = getEnvString('npm_execpath')?.includes('npx');
      const runCommand = isNpx ? 'npx promptfoo@latest init' : 'promptfoo init';
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
