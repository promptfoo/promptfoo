import checkbox from '@inquirer/checkbox';
import { Separator } from '@inquirer/checkbox';
import confirm from '@inquirer/confirm';
import { ExitPromptError } from '@inquirer/core';
import editor from '@inquirer/editor';
import input from '@inquirer/input';
import rawlist from '@inquirer/rawlist';
import select from '@inquirer/select';
import chalk from 'chalk';
import type { Command } from 'commander';
import dedent from 'dedent';
import * as fs from 'fs';
import * as path from 'path';
import { getUserEmail, setUserEmail } from '../../accounts';
import { getEnvString } from '../../envars';
import { readGlobalConfig, writeGlobalConfigPartial } from '../../globalConfig';
import logger from '../../logger';
import {
  ADDITIONAL_STRATEGIES,
  ALL_PLUGINS,
  DEFAULT_PLUGINS,
  DEFAULT_STRATEGIES,
  subCategoryDescriptions,
} from '../../redteam/constants';
import telemetry, { type EventValue } from '../../telemetry';
import type { RedteamPluginObject } from '../../types';
import { extractVariablesFromTemplate, getNunjucksEngine } from '../../util/templates';
import { doGenerateRedteam } from './generate';

const REDTEAM_CONFIG_TEMPLATE = `# Red teaming configuration
# Docs: https://promptfoo.dev/docs/red-team/configuration

description: "My first red team"

{% if purpose is defined -%}
purpose: {{ purpose | dump }}
{% endif %}
prompts:
  {% for prompt in prompts -%}
  - {{ prompt | dump }}
  {% endfor -%}
  {% if prompts.length > 0 and not prompts[0].startsWith('file://') -%}
  # You can also reference external prompts, e.g.
  # - file:///path/to/prompt.json
  # Learn more: https://promptfoo.dev/docs/configuration/parameters/#prompts
  {% endif %}

providers:
  # Providers are red team targets. To talk directly to your application, use a custom provider.
  # See https://promptfoo.dev/docs/red-team/configuration/#providers
  {% for provider in providers -%}
  - {{ provider }}
  {% endfor %}

redteam:
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
    'NOTE: your prompt must include one or more injectable variables like {{query}} or {{name}} as a placeholder for user input (REMOVE THIS LINE)';

  let prompt = dedent`You are a helpful and concise assistant.

  User query: {{query}}

  ${NOTE}`;
  prompt = await editor({
    message: 'Enter the prompt you want to test against:',
    default: prompt,
  });
  prompt = prompt.replace(NOTE, '');
  let variables = extractVariablesFromTemplate(prompt);
  while (variables.length < numVariablesRequired) {
    logger.info(
      chalk.red(
        `For real though, your prompt must include ${numVariablesRequired} ${
          numVariablesRequired === 1 ? 'variable' : 'variables'
        } like "{{query}}" as a placeholder for user input`,
      ),
    );
    prompt = await editor({
      message: 'Enter the prompt you want to test against:',
      default: prompt,
    });

    variables = extractVariablesFromTemplate(prompt);
  }

  return prompt;
}

export async function redteamInit(directory: string | undefined) {
  telemetry.maybeShowNotice();
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
      { name: 'Red team a prompt, model, or chatbot', value: 'prompt_model_chatbot' },
      { name: 'Red team a RAG', value: 'rag' },
      { name: 'Red team an Agent', value: 'agent' },
    ],
    pageSize: process.stdout.rows - 6,
  });

  recordOnboardingStep('choose app type', { value: redTeamChoice });

  const prompts: string[] = [];
  let defaultPromptUsed = false;
  let purpose: string | undefined;

  const useCustomProvider = redTeamChoice === 'rag' || redTeamChoice === 'agent';
  let deferGeneration = useCustomProvider;
  const defaultPrompt =
    'You are a travel agent specialized in budget trips to Europe\n\nUser query: {{query}}';
  const defaultPurpose = 'Travel agent specializing in budget trips to Europe';
  if (useCustomProvider) {
    purpose =
      (await input({
        message: dedent`What is the purpose of your application? This is used to tailor the attacks. Be as specific as possible.
        (e.g. "${defaultPurpose}")\n`,
      })) || defaultPurpose;
    prompts.push(`{{query}}`);

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
      defaultPromptUsed = true;
      prompt = defaultPrompt;
      deferGeneration = true;
    }
    prompts.push(prompt);
  } else {
    defaultPromptUsed = true;
    prompts.push(
      'You are a travel agent specialized in budget trips to Europe\n\nUser query: {{query}}',
    );
  }

  let providers: string[];
  if (useCustomProvider) {
    providers = ['python:chat.py'];
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

    const apiKeyChoice = await rawlist({
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

  logger.info(chalk.bold('Plugin Configuration\n'));

  const pluginChoices = Array.from(ALL_PLUGINS)
    .sort()
    .map((plugin) => ({
      name: `${plugin} - ${subCategoryDescriptions[plugin] || 'No description'}`,
      value: plugin,
      checked: DEFAULT_PLUGINS.has(plugin),
    }));

  const plugins: (string | RedteamPluginObject)[] = await checkbox({
    message: `Plugins generate adversarial inputs. Select the ones you want to use. Don't worry, you can change this later:`,
    choices: pluginChoices,
    pageSize: process.stdout.rows - 6,
    loop: false,
    validate: (answer) => answer.length > 0 || 'You must select at least one plugin.',
  });

  recordOnboardingStep('choose plugins', {
    value: plugins.map((p) => (typeof p === 'string' ? p : p.id)),
  });

  // Handle policy plugin
  if (plugins.includes('policy')) {
    // Remove the original 'policy' string if it exists
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

  // Handle prompt extraction plugin
  if (plugins.includes('prompt-extraction')) {
    const promptExtractionIdx = plugins.indexOf('prompt-extraction');
    if (promptExtractionIdx !== -1) {
      plugins.splice(promptExtractionIdx, 1);
    }

    if (defaultPromptUsed) {
      recordOnboardingStep('collect system prompt');
      const systemPrompt = await getSystemPrompt();
      recordOnboardingStep('choose system prompt', { value: systemPrompt.length });

      if (systemPrompt.trim() !== '') {
        plugins.push({
          id: 'prompt-extraction',
          config: { systemPrompt: dedent(systemPrompt.trim()) },
        } as RedteamPluginObject);

        prompts[0] = systemPrompt;
      }
    } else {
      plugins.push({
        id: 'prompt-extraction',
        config: { systemPrompt: prompts[0] },
      } as RedteamPluginObject);
    }
  }

  // Handle prompt extraction plugin
  if (plugins.includes('indirect-prompt-injection')) {
    logger.info(chalk.bold('Indirect Prompt Injection Configuration\n'));
    logger.info(
      chalk.yellow(
        'This plugin tests if the prompt is vulnerable to instructions injected into the prompt.\n',
      ),
    );
    logger.info(
      chalk.yellow(
        'This plugin requires two pieces of information:\n' +
          '1. The system prompt: This is the template that includes variables where content will be injected.\n' +
          '2. The indirectInjectionVarName: This is the name of the variable in your system prompt where untrusted content will be injected.\n\n' +
          'These are needed to test if the model is vulnerable to instructions injected into the prompt through this variable.\n',
      ),
    );
    await input({
      message: 'Read the above and Press Enter to continue setting up the plugin.',
    });

    const promptExtractionIdx = plugins.indexOf('indirect-prompt-injection');
    if (promptExtractionIdx !== -1) {
      plugins.splice(promptExtractionIdx, 1);
    }

    if (defaultPromptUsed) {
      const systemPrompt = await getSystemPrompt(2);
      const variables = extractVariablesFromTemplate(systemPrompt);
      let indirectInjectionVar = variables[0].trim();
      indirectInjectionVar = await input({
        message: `What is the name of the variable where content will be injected into the prompt? (e.g. "name")`,
        default: indirectInjectionVar,
      });

      indirectInjectionVar = indirectInjectionVar.trim();

      if (!variables.includes(indirectInjectionVar)) {
        logger.info(
          chalk.red(
            `The variable ${indirectInjectionVar} is not found in the prompt. Please go back and edit your prompt to add the variable to your prompt`,
          ),
        );
        await input({
          message: 'Press Enter to continue...',
        });
      }
      if (indirectInjectionVar === variables[variables.length - 1]) {
        logger.info(
          chalk.red(
            `The variable ${indirectInjectionVar} is the last variable in the prompt. This might cause some issues with the plugin since we assume the last variable is the main injectVar. Please make sure you set injectVar properly in your config.`,
          ),
        );
        await input({
          message: 'Press Enter to continue...',
        });
      }

      if (systemPrompt.trim() !== '') {
        plugins.push({
          id: 'indirect-prompt-injection',
          config: {
            systemPrompt: dedent(systemPrompt.trim()),
            indirectInjectionVar: indirectInjectionVar.trim(),
          },
        } as RedteamPluginObject);

        prompts[0] = systemPrompt;
      }
    } else {
      plugins.push({
        id: 'prompt-extraction',
        config: { systemPrompt: prompts[0] },
      } as RedteamPluginObject);
    }
  }

  console.clear();
  logger.info(chalk.bold('Strategy Configuration\n'));

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

  const strategies = await checkbox({
    message: `Strategies are attack methods. Select the ones you want to use. Don't worry, you can change this later:`,
    choices: strategyChoices,
    pageSize: process.stdout.rows - 6,
    loop: false,
  });

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
  logger.info(chalk.green(`\nCreated red teaming configuration file at ${configPath}\n`));

  telemetry.record('command_used', { name: 'redteam init' });
  await recordOnboardingStep('finish');

  if (deferGeneration) {
    logger.info(
      '\n' +
        chalk.blue(
          'To generate test cases after editing your configuration, use the command: ' +
            chalk.bold('promptfoo redteam generate'),
        ),
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
