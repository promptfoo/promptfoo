import checkbox from '@inquirer/checkbox';
import { Separator } from '@inquirer/checkbox';
import confirm from '@inquirer/confirm';
import { ExitPromptError } from '@inquirer/core';
import editor from '@inquirer/editor';
import input from '@inquirer/input';
import select from '@inquirer/select';
import chalk from 'chalk';
import type { Command } from 'commander';
import dedent from 'dedent';
import * as fs from 'fs';
import * as path from 'path';
import { getEnvString } from '../../envars';
import { getUserEmail, setUserEmail } from '../../globalConfig/accounts';
import { readGlobalConfig, writeGlobalConfigPartial } from '../../globalConfig/globalConfig';
import logger from '../../logger';
import telemetry, { type EventValue } from '../../telemetry';
import type { ProviderOptions, RedteamPluginObject } from '../../types';
import { extractVariablesFromTemplate, getNunjucksEngine } from '../../util/templates';
import {
  type Plugin,
  ADDITIONAL_STRATEGIES,
  ALL_PLUGINS,
  DEFAULT_PLUGINS,
  DEFAULT_STRATEGIES,
  type Strategy,
  subCategoryDescriptions,
} from '../constants';
import { doGenerateRedteam } from './generate';

const REDTEAM_CONFIG_TEMPLATE = `# Red teaming configuration
# Docs: https://promptfoo.dev/docs/red-team/configuration

description: "My first red team"

{% if prompts.length > 0 -%}
prompts:
  {% for prompt in prompts -%}
  - {{ prompt | dump }}
  {% endfor -%}
  {% if prompts.length > 0 and not prompts[0].startsWith('file://') -%}
  # You can also reference external prompts, e.g.
  # - file:///path/to/prompt.json
  # Learn more: https://promptfoo.dev/docs/configuration/parameters/#prompts
  {% endif %}
{% endif -%}

targets:
  # Red team targets. To talk directly to your application, use a custom provider.
  # See https://promptfoo.dev/docs/red-team/configuration/#providers
  {% for provider in providers -%}
  {% if provider is string -%}
  - {{ provider }}
  {% else -%}
  - id: {{ provider.id }}
    config:
      {% for k, v in provider.config -%}
      {{ k }}: {{ v | dump }}
      {% endfor -%}
  {% endif -%}
  {% endfor %}

# Other redteam settings
redteam:
  {% if purpose is defined -%}
  purpose: {{ purpose | dump }}
  {% endif %}
  # Default number of inputs to generate for each plugin.
  # The total number of tests will be (numTests * plugins.length * (1 + strategies.length))
  numTests: {{numTests}}

  {% if plugins.length > 0 -%}
  # Each plugin generates {{numTests}} adversarial inputs.
  # To control the number of tests for each plugin, use:
  # - id: plugin-name
  #   numTests: 10
  plugins:
    {% for plugin in plugins -%}
    {% if plugin is string -%}
    - {{plugin}}  # {{descriptions[plugin]}}
    {% else -%}
    - id: {{plugin.id}}  # {{descriptions[plugin.id]}}
      {% if plugin.numTests is defined -%}
      numTests: {{plugin.numTests}}
      {% endif -%}
      {%- if plugin.config is defined -%}
      config:
        {%- for k, v in plugin.config %}
        {{k}}: {{v | dump}}
        {%- endfor -%}
      {%- endif %}
    {% endif -%}
    {%- endfor %}
  {% endif -%}

  {% if strategies.length > 0 -%}
  # Attack methods for applying adversarial inputs
  strategies:
    {% for strategy in strategies -%}
    - {{strategy}} # {{descriptions[strategy]}}
    {% endfor %}
  {% endif -%}
`;

const CUSTOM_PROVIDER_TEMPLATE = `# Custom provider for red teaming
# Docs: https://promptfoo.dev/docs/red-team/configuration/#providers

import http.client
import urllib.parse
import json

def call_api(prompt, options, context):
    parsed_url = urllib.parse.urlparse('https://example.com/api/chat)
    conn = http.client.HTTPSConnection(parsed_url.netloc)

    headers = {'Content-Type': 'application/json'}
    payload = json.dumps({'user_chat': prompt})

    conn.request("POST", parsed_url.path or "/", body=payload, headers=headers)
    response = conn.getresponse()

    return {
      "output": response.read().decode()
    }
`;

function recordOnboardingStep(step: string, properties: Record<string, EventValue> = {}) {
  telemetry.recordAndSend('funnel', {
    type: 'redteam onboarding',
    step,
    ...properties,
  });
}

async function getSystemPrompt(numVariablesRequired: number = 1): Promise<string> {
  const NOTE =
    'NOTE: your prompt must include one or more injectable variables like {{prompt}} or {{name}} as a placeholder for user input (REMOVE THIS LINE)';

  let prompt = dedent`You are a helpful and concise assistant.

  User query: {{prompt}}

  ${NOTE}`;
  prompt = await editor({
    message: 'Enter the prompt you want to test against:',
    default: prompt,
  });
  prompt = prompt.replace(NOTE, '');
  const variables = extractVariablesFromTemplate(prompt);
  if (variables.length < numVariablesRequired) {
    // Give the user another chance to edit their prompt
    logger.info(
      chalk.red(
        `Your prompt must include ${numVariablesRequired} ${
          numVariablesRequired === 1 ? 'variable' : 'variables'
        } like "{{prompt}}" as a placeholder for user input.`,
      ),
    );
    prompt = await editor({
      message: 'Enter the prompt you want to test against:',
      default: prompt,
    });
  }

  return prompt;
}

export async function redteamInit(directory: string | undefined) {
  telemetry.record('command_used', { name: 'redteam init - started' });
  recordOnboardingStep('start');

  const projectDir = directory || '.';
  if (projectDir !== '.' && !fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }

  const configPath = path.join(projectDir, 'promptfooconfig.yaml');

  console.clear();
  logger.info(chalk.bold('Red Team Configuration\n'));

  const redTeamChoice = await select({
    message: 'What would you like to do?',
    choices: [
      { name: 'Not sure yet', value: 'not_sure' },
      { name: 'Red team an HTTP endpoint', value: 'http_endpoint' },
      { name: 'Red team a model + prompt', value: 'prompt_model_chatbot' },
      { name: 'Red team a RAG', value: 'rag' },
      { name: 'Red team an Agent', value: 'agent' },
    ],
    pageSize: process.stdout.rows - 6,
  });

  recordOnboardingStep('choose app type', { value: redTeamChoice });

  const prompts: string[] = [];
  let purpose: string | undefined;

  const useCustomProvider =
    redTeamChoice === 'rag' ||
    redTeamChoice === 'agent' ||
    redTeamChoice === 'http_endpoint' ||
    redTeamChoice === 'not_sure';
  let deferGeneration = useCustomProvider;
  const defaultPrompt =
    'You are a travel agent specialized in budget trips to Europe\n\nUser query: {{prompt}}';
  const defaultPurpose = 'Travel agent specializing in budget trips to Europe';
  if (useCustomProvider) {
    purpose =
      (await input({
        message: dedent`What is the purpose of your application? This is used to tailor the attacks. Be as specific as possible.
        (e.g. "${defaultPurpose}")\n`,
      })) || defaultPurpose;

    recordOnboardingStep('choose purpose', { value: purpose });
  } else if (redTeamChoice === 'prompt_model_chatbot') {
    const promptChoice = await select({
      message: 'Do you want to enter a prompt now or later?',
      choices: [
        { name: 'Enter prompt now', value: 'now' },
        { name: 'Enter prompt later', value: 'later' },
      ],
    });

    recordOnboardingStep('choose prompt', { value: promptChoice });

    let prompt: string;
    if (promptChoice === 'now') {
      prompt = await getSystemPrompt();
    } else {
      prompt = defaultPrompt;
      deferGeneration = true;
    }
    prompts.push(prompt);
  } else {
    prompts.push(
      'You are a travel agent specialized in budget trips to Europe\n\nUser query: {{prompt}}',
    );
  }

  let providers: (string | ProviderOptions)[];
  if (useCustomProvider) {
    if (redTeamChoice === 'http_endpoint' || redTeamChoice === 'not_sure') {
      providers = [
        {
          id: 'https://example.com/generate',
          config: {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: {
              myPrompt: '{{prompt}}',
            },
            responseParser: 'json.output',
          },
        },
      ];
    } else {
      providers = ['python:chat.py'];
    }
  } else {
    const providerChoices = [
      { name: `I'll choose later`, value: 'Other' },
      { name: 'openai:gpt-4o-mini', value: 'openai:gpt-4o-mini' },
      { name: 'openai:gpt-4o', value: 'openai:gpt-4o' },
      { name: 'openai:gpt-3.5-turbo', value: 'openai:gpt-3.5-turbo' },
      {
        name: 'anthropic:claude-3-5-sonnet-20240620',
        value: 'anthropic:messages:claude-3-5-sonnet-20240620',
      },
      {
        name: 'anthropic:claude-3-opus-20240307',
        value: 'anthropic:messages:claude-3-opus-20240307',
      },
      { name: 'vertex:gemini-pro', value: 'vertex:gemini-pro' },
    ];

    const selectedProvider = await select({
      message: 'Choose a model to target:',
      choices: providerChoices,
      pageSize: process.stdout.rows - 6,
    });

    recordOnboardingStep('choose provider', { value: selectedProvider });

    if (selectedProvider === 'Other') {
      providers = ['openai:gpt-4o-mini'];
    } else {
      providers = [selectedProvider];
    }
  }

  if (!getEnvString('OPENAI_API_KEY')) {
    recordOnboardingStep('missing api key');

    console.clear();
    logger.info(chalk.bold('OpenAI API Configuration\n'));

    const apiKeyChoice = await select({
      message: `OpenAI API key is required, but I don't see an OPENAI_API_KEY environment variable. How to proceed?`,
      choices: [
        { name: 'Enter API key now', value: 'enter' },
        { name: 'Set it later', value: 'later' },
      ],
    });

    recordOnboardingStep('choose api key', { value: apiKeyChoice });

    if (apiKeyChoice === 'enter') {
      const apiKey = await input({ message: 'Enter your OpenAI API key:' });
      process.env.OPENAI_API_KEY = apiKey;
      logger.info('OPENAI_API_KEY set for this session.');
    } else {
      deferGeneration = true;
      logger.warn('Remember to set OPENAI_API_KEY before generating the dataset.');
    }
  }

  console.clear();

  recordOnboardingStep('begin plugin & strategy selection');

  logger.info(chalk.bold('Plugin Configuration'));
  logger.info('Plugins generate adversarial inputs.\n');

  const pluginConfigChoice = await select({
    message: 'How would you like to configure plugins?',
    choices: [
      { name: 'Use the defaults (configure later)', value: 'default' },
      { name: 'Manually select', value: 'manual' },
    ],
  });

  recordOnboardingStep('choose plugin config method', { value: pluginConfigChoice });

  let plugins: (Plugin | RedteamPluginObject)[];

  if (pluginConfigChoice === 'default') {
    if (redTeamChoice === 'rag') {
      plugins = Array.from(DEFAULT_PLUGINS);
    } else if (redTeamChoice === 'agent') {
      plugins = [...DEFAULT_PLUGINS, 'rbac', 'bola', 'bfla', 'ssrf'];
    } else {
      plugins = Array.from(DEFAULT_PLUGINS);
    }
  } else {
    const pluginChoices = Array.from(ALL_PLUGINS)
      .sort()
      .map((plugin) => ({
        name: `${plugin} - ${subCategoryDescriptions[plugin] || 'No description'}`,
        value: plugin,
        checked: DEFAULT_PLUGINS.has(plugin),
      }));

    plugins = await checkbox({
      message: `Select the plugins you want to use. Don't worry, you can change this later:`,
      choices: pluginChoices,
      pageSize: process.stdout.rows - 6,
      loop: false,
      validate: (answer) => answer.length > 0 || 'You must select at least one plugin.',
    });

    recordOnboardingStep('choose plugins', {
      value: plugins.map((p) => (typeof p === 'string' ? p : p.id)),
    });
  }

  // Plugins that require additional configuration

  if (plugins.includes('policy')) {
    const policyIndex = plugins.indexOf('policy');
    if (policyIndex !== -1) {
      plugins.splice(policyIndex, 1);
    }

    recordOnboardingStep('collect policy');
    const policyDescription = await input({
      message:
        'You selected the `policy` plugin. Please enter your custom policy description, or leave empty to skip.\n(e.g. "Never talk about the weather")',
    });
    recordOnboardingStep('choose policy', { value: policyDescription.length });

    if (policyDescription.trim() !== '') {
      plugins.push({
        id: 'policy',
        config: { policy: policyDescription.trim() },
      } as RedteamPluginObject);
    }
  }

  if (plugins.includes('prompt-extraction')) {
    plugins.push({
      id: 'prompt-extraction',
      config: { systemPrompt: prompts[0] },
    } as RedteamPluginObject);
  }

  if (plugins.includes('indirect-prompt-injection')) {
    recordOnboardingStep('choose indirect prompt injection variable');
    logger.info(chalk.bold('Indirect Prompt Injection Configuration\n'));
    const variables = extractVariablesFromTemplate(prompts[0]);
    if (variables.length > 1) {
      const indirectInjectionVar = await select({
        message: 'Which variable would you like to test for indirect prompt injection?',
        choices: variables.sort().map((variable) => ({
          name: variable,
          value: variable,
        })),
      });
      recordOnboardingStep('chose indirect prompt injection variable');

      plugins.push({
        id: 'indirect-prompt-injection',
        config: {
          indirectInjectionVar,
        },
      } as RedteamPluginObject);
    } else {
      recordOnboardingStep('skip indirect prompt injection');
      logger.warn(
        `Skipping indirect prompt injection plugin because it requires at least two {{variables}} in the prompt. Learn more: https://www.promptfoo.dev/docs/red-team/plugins/indirect-prompt-injection/`,
      );
    }
  }

  console.clear();

  logger.info(chalk.bold('Strategy Configuration'));
  logger.info('Strategies are attack methods.\n');

  const strategyConfigChoice = await select({
    message: 'How would you like to configure strategies?',
    choices: [
      { name: 'Use the defaults (configure later)', value: 'default' },
      { name: 'Manually select', value: 'manual' },
    ],
  });

  recordOnboardingStep('choose strategy config method', { value: strategyConfigChoice });

  let strategies: Strategy[];

  if (strategyConfigChoice === 'default') {
    // TODO(ian): Differentiate strategies
    if (redTeamChoice === 'rag') {
      strategies = Array.from(DEFAULT_STRATEGIES);
    } else if (redTeamChoice === 'agent') {
      strategies = Array.from(DEFAULT_STRATEGIES);
    } else {
      strategies = Array.from(DEFAULT_STRATEGIES);
    }
  } else {
    const strategyChoices = [
      ...Array.from(DEFAULT_STRATEGIES).sort(),
      new Separator(),
      ...Array.from(ADDITIONAL_STRATEGIES).sort(),
    ].map((strategy) =>
      typeof strategy === 'string'
        ? {
            name: `${strategy} - ${subCategoryDescriptions[strategy] || 'No description'}`,
            value: strategy,
            checked: DEFAULT_STRATEGIES.includes(strategy as any),
          }
        : strategy,
    );

    strategies = await checkbox({
      message: `Select the ones you want to use. Don't worry, you can change this later:`,
      choices: strategyChoices,
      pageSize: process.stdout.rows - 6,
      loop: false,
    });
  }

  recordOnboardingStep('choose strategies', {
    value: strategies,
  });

  const hasHarmfulPlugin = plugins.some(
    (plugin) => typeof plugin === 'string' && plugin.startsWith('harmful'),
  );
  if (hasHarmfulPlugin) {
    recordOnboardingStep('collect email');
    const { hasHarmfulRedteamConsent } = readGlobalConfig();
    if (!hasHarmfulRedteamConsent) {
      logger.info(chalk.yellow('\nImportant Notice:'));
      logger.info(
        'You have selected one or more plugins that generate potentially harmful content.',
      );
      logger.info(
        'This content is intended solely for adversarial testing and evaluation purposes.',
      );

      const existingEmail = getUserEmail();

      let email: string;
      if (existingEmail) {
        const confirmExistingEmail = await confirm({
          message: `Do you agree?`,
          default: true,
        });
        if (!confirmExistingEmail) {
          process.exit(1);
        }
        email = existingEmail;
      } else {
        email = await input({
          message: 'Please enter your email address to confirm your agreement:',
          validate: (value) => {
            return value.includes('@') || 'Please enter a valid email address';
          },
        });
        setUserEmail(email);
      }

      try {
        await telemetry.saveConsent(email);
        writeGlobalConfigPartial({ hasHarmfulRedteamConsent: true });
      } catch (err) {
        logger.error(`Error saving consent: ${(err as Error).message}`);
      }
    }
  }

  const numTests = 5;

  const nunjucks = getNunjucksEngine();

  const redteamConfig = nunjucks.renderString(REDTEAM_CONFIG_TEMPLATE, {
    purpose,
    numTests,
    plugins,
    strategies,
    prompts,
    providers,
    descriptions: subCategoryDescriptions,
  });
  fs.writeFileSync(configPath, redteamConfig, 'utf8');

  if (useCustomProvider) {
    fs.writeFileSync(path.join(projectDir, 'chat.py'), CUSTOM_PROVIDER_TEMPLATE, 'utf8');
  }

  console.clear();
  logger.info(
    chalk.green(`\nCreated red teaming configuration file at ${chalk.bold(configPath)}\n`),
  );

  telemetry.record('command_used', { name: 'redteam init' });
  await recordOnboardingStep('finish');

  if (deferGeneration) {
    logger.info(
      '\n' +
        chalk.green(dedent`
          To generate test cases after editing your configuration, use the command:

              ${chalk.bold('promptfoo redteam generate')}
        `),
    );
    return;
  } else {
    recordOnboardingStep('offer generate');
    const readyToGenerate = await confirm({
      message: 'Are you ready to generate adversarial test cases?',
      default: true,
    });
    recordOnboardingStep('choose generate', { value: readyToGenerate });

    if (readyToGenerate) {
      await doGenerateRedteam({
        purpose,
        plugins: plugins.map((plugin) => (typeof plugin === 'string' ? { id: plugin } : plugin)),
        cache: false,
        write: false,
        output: 'redteam.yaml',
        defaultConfig: {},
        defaultConfigPath: configPath,
        numTests,
      });
    } else {
      logger.info(
        '\n' +
          chalk.blue(
            'To generate test cases later, use the command: ' +
              chalk.bold('promptfoo redteam generate'),
          ),
      );
    }
  }
}

export function initCommand(program: Command) {
  program
    .command('init [directory]')
    .description('Initialize red teaming project')
    .action(async (directory: string | undefined) => {
      try {
        await redteamInit(directory);
      } catch (err) {
        if (err instanceof ExitPromptError) {
          logger.info(
            '\n' +
              chalk.blue(
                'Red team initialization paused. To continue setup later, use the command: ',
              ) +
              chalk.bold('promptfoo redteam init'),
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
    });
}
