import chalk from 'chalk';
import dedent from 'dedent';
import cliProgress from 'cli-progress';
import invariant from 'tiny-invariant';

import logger from '../logger';
import { OpenAiChatCompletionProvider } from '../providers/openai';
import {
  getHarmfulTests,
  addInjections,
  addIterativeJailbreaks,
  HARM_CATEGORIES,
} from './getHarmfulTests';
import { getHijackingTests } from './getHijackingTests';
import { getHallucinationTests } from './getHallucinationTests';
import { getOverconfidenceTests } from './getOverconfidenceTests';
import { getUnderconfidenceTests } from './getUnderconfidenceTests';
import { getPiiTests } from './getPiiTests';
import { SYNTHESIS_MODEL } from './constants';

import type { ApiProvider, TestCase, TestSuite } from '../types';

interface SynthesizeOptions {
  prompts: string[];
  injectVar?: string;
  purpose?: string;
  plugins: string[];
}

const ALL_PLUGINS = new Set(
  [
    'excessive-agency',
    'hallucination',
    'harmful',
    'hijacking',
    'jailbreak',
    'overreliance',
    'pii',
    'prompt-injection',
  ].concat(Object.keys(HARM_CATEGORIES)),
);

function validatePlugins(plugins: string[]) {
  for (const plugin of plugins) {
    if (!ALL_PLUGINS.has(plugin)) {
      throw new Error(
        `Invalid plugin: ${plugin}. Must be one of: ${Array.from(ALL_PLUGINS).join(', ')}`,
      );
    }
  }
}

export async function synthesizeFromTestSuite(
  testSuite: TestSuite,
  options: Partial<SynthesizeOptions>,
) {
  return synthesize({
    ...options,
    plugins:
      options.plugins && options.plugins.length > 0 ? options.plugins : Array.from(ALL_PLUGINS),
    prompts: testSuite.prompts.map((prompt) => prompt.raw),
  });
}

export async function synthesize({
  prompts,
  injectVar,
  purpose: purposeOverride,
  plugins,
}: SynthesizeOptions) {
  validatePlugins(plugins);
  const reasoningProvider = new OpenAiChatCompletionProvider(SYNTHESIS_MODEL);

  logger.info(
    `Synthesizing test cases for ${prompts.length} ${
      prompts.length === 1 ? 'prompt' : 'prompts'
    }...\nPlugins: ${chalk.yellow(plugins.join(', '))}`,
  );

  // Initialize progress bar
  const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
  const totalSteps = plugins.length + 2; // +2 for initial setup steps
  let currentStep = 0;

  if (process.env.LOG_LEVEL !== 'debug') {
    progressBar.start(100, 0);
  }

  const updateProgress = () => {
    currentStep += 1;
    const progress = Math.floor((currentStep / totalSteps) * 100);
    progressBar.update(progress);
  };

  // Get vars
  injectVar = injectVar || 'query';

  // Get purpose
  updateProgress();
  const purpose = purposeOverride || (await getPurpose(prompts, reasoningProvider));
  updateProgress();

  logger.debug(`System purpose: ${purpose}`);

  // Get adversarial test cases
  const testCases: TestCase[] = [];
  const adversarialPrompts: TestCase[] = [];

  if (
    plugins.includes('prompt-injection') ||
    plugins.includes('jailbreak') ||
    plugins.some((p) => p.startsWith('harmful'))
  ) {
    logger.debug('Generating harmful test cases');
    const harmfulPrompts = await getHarmfulTests(
      purpose,
      injectVar,
      plugins.filter((p) => p.startsWith('harmful:')),
    );
    testCases.push(...harmfulPrompts);
    adversarialPrompts.push(...harmfulPrompts);
    logger.debug(`Added ${harmfulPrompts.length} harmful test cases`);
  }

  const pluginActions: {
    [key: string]: (purpose: string, injectVar: string) => Promise<TestCase[]>;
  } = {
    'excessive-agency': getOverconfidenceTests,
    hallucination: getHallucinationTests,
    hijacking: getHijackingTests,
    jailbreak: addIterativeJailbreaks.bind(null, adversarialPrompts),
    overreliance: getUnderconfidenceTests,
    pii: getPiiTests,
    'prompt-injection': addInjections.bind(null, adversarialPrompts),
  };

  for (const plugin of plugins) {
    if (pluginActions[plugin]) {
      updateProgress();
      logger.debug(`Generating ${plugin} tests`);
      const pluginTests = await pluginActions[plugin](purpose, injectVar);
      testCases.push(...pluginTests);
      logger.debug(`Added ${pluginTests.length} ${plugin} test cases`);
    }
  }

  // Finish progress bar
  if (process.env.LOG_LEVEL !== 'debug') {
    progressBar.update(100);
    progressBar.stop();
  }

  return testCases;
}

async function getPurpose(prompts: string[], reasoningProvider: ApiProvider): Promise<string> {
  const { output: purpose } = await reasoningProvider.callApi(dedent`
    The following are prompts that are being used to test an LLM application:
    
    ${prompts
      .map(
        (prompt) => dedent`
      <prompt>
      ${prompt}
      </prompt>`,
      )
      .join('\n')}
    
    Given the above prompts, output the "system purpose" of the application in a single sentence.
    
    Example outputs:
    - Provide users a way to manage finances
    - Executive assistant that helps with scheduling and reminders
    - Ecommerce chatbot that sells shoes
  `);

  invariant(typeof purpose === 'string', 'Expected purpose to be a string');
  return purpose;
}
