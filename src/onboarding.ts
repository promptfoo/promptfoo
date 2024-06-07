import fs from 'fs';
import path from 'path';

import chalk from 'chalk';
import inquirer from 'inquirer';

import logger from './logger';
import { getNunjucksEngine } from './util';

export const CONFIG_TEMPLATE = `# Learn more about building a configuration: https://promptfoo.dev/docs/configuration/guide
description: 'My eval'

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
      context: file://context.txt
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
    return \`... Documents for \${otherVars.inquiry} for prompt: \${prompt} ...\`;
  }

  // Default variable value
  return {
    output: 'Document A, Document B, Document C, ...',
  };

  // Handle potential errors
  // return { error: 'Error message' }
};
`;

export const DEFAULT_README = `To get started, set your OPENAI_API_KEY environment variable.

Next, edit promptfooconfig.yaml.

Then run:
\`\`\`
promptfoo eval
\`\`\`

Afterwards, you can view the results by running \`promptfoo view\`
`;

export async function createDummyFiles(directory: string | null, interactive: boolean = true) {
  if (directory) {
    // Make the directory if it doesn't exist
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory);
    }
  }

  if (directory) {
    if (!fs.existsSync(directory)) {
      logger.info(`Creating directory ${directory} ...`);
      fs.mkdirSync(directory);
    }
  } else {
    directory = '.';
  }

  const prompts: string[] = [];
  const providers: (string | object)[] = [];
  let action: string;
  let language: string;
  if (interactive) {
    // Choose use case
    let resp = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Not sure yet', value: 'compare' },
          { name: 'Improve prompt and model performance', value: 'compare' },
          { name: 'Improve RAG performance', value: 'rag' },
          { name: 'Improve agent/chain of thought performance', value: 'agent' },
        ],
      },
    ]);
    action = resp.action;

    language = 'not_sure';
    if (action === 'rag' || action === 'agent') {
      resp = await inquirer.prompt([
        {
          type: 'list',
          name: 'language',
          message: 'What programming language are you developing the app in?',
          choices: [
            { name: 'Not sure yet', value: 'not_sure' },
            { name: 'Python', value: 'python' },
            { name: 'Javascript', value: 'javascript' },
          ],
        },
      ]);
      language = resp.language;
    }

    if (action === 'compare') {
      prompts.push(`Write a tweet about {{topic}}`);
      prompts.push(`Write a concise, funny tweet about {{topic}}`);
    } else if (action === 'rag') {
      prompts.push(
        'Write a customer service response to:\n\n{{inquiry}}\n\nUse these documents:\n\n{{context}}',
      );
    } else if (action === 'agent') {
      prompts.push(`Fulfill this user helpdesk ticket: {{inquiry}}`);
    }
    const choices: { name: string; value: (string | object)[] }[] = [
      { name: 'Choose later', value: ['openai:gpt-3.5-turbo', 'openai:gpt-4o'] },
      {
        name: '[OpenAI] GPT 4o, GPT-3.5, ...',
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
            : ['openai:gpt-3.5-turbo', 'openai:gpt-4o'],
      },
      {
        name: '[Anthropic] Claude Opus, Sonnet, Haiku, ...',
        value: [
          'anthropic:messages:claude-3-haiku-20240307',
          'anthropic:messages:claude-3-opus-20240307',
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
    let { providerChoices } = (await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'providerChoices',
        message: 'Which model providers would you like to use? (press enter to skip)',
        choices,
      },
    ])) as { providerChoices: (string | object)[] };

    if (providerChoices && providerChoices.length > 0) {
      const flatProviders = providerChoices.flat();
      if (flatProviders.length > 3) {
        providers.push(
          ...providerChoices.map((choice) => (Array.isArray(choice) ? choice[0] : choice)),
        );
      } else {
        providers.push(...flatProviders);
      }

      if (
        flatProviders.some((choice) => typeof choice === 'string' && choice.startsWith('file://'))
      ) {
        fs.writeFileSync(path.join(process.cwd(), directory, 'provider.js'), JAVASCRIPT_PROVIDER);
        logger.info('⌛ Wrote provider.js');
      }
      if (
        flatProviders.some((choice) => typeof choice === 'string' && choice.startsWith('exec:'))
      ) {
        fs.writeFileSync(path.join(process.cwd(), directory, 'provider.sh'), BASH_PROVIDER);
        logger.info('⌛ Wrote provider.sh');
      }
      if (
        flatProviders.some((choice) => typeof choice === 'string' && choice.startsWith('python:'))
      ) {
        fs.writeFileSync(path.join(process.cwd(), directory, 'provider.py'), PYTHON_PROVIDER);
        logger.info('⌛ Wrote provider.py');
      }
    } else {
      providers.push('openai:gpt-3.5-turbo');
      providers.push('openai:gpt-4o');
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
  } else {
    action = 'compare';
    language = 'not_sure';
    prompts.push(`Write a tweet about {{topic}}`);
    prompts.push(`Write a concise, funny tweet about {{topic}}`);
    providers.push('openai:gpt-3.5-turbo');
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

  const isNpx = process.env.npm_execpath?.includes('npx');
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
