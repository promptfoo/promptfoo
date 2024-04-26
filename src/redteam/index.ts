import dedent from 'dedent';
import cliProgress from 'cli-progress';
import invariant from 'tiny-invariant';

import logger from '../logger';
import { OpenAiChatCompletionProvider } from '../providers/openai';
import { getHarmfulTests, addInjections, addIterativeJailbreaks } from './getHarmfulTests';
import { getHijackingTests } from './getHijackingTests';
import { getHallucinationTests } from './getHallucinationTests';
import { getOverconfidenceTests } from './getOverconfidenceTests';
import { getUnderconfidenceTests } from './getUnderconfidenceTests';
import { SYNTHESIS_MODEL } from './constants';

import type { ApiProvider, TestCase, TestSuite } from '../types';

interface SynthesizeOptions {
  prompts: string[];
  injectVar?: string;
  purpose?: string;
}

export async function synthesizeFromTestSuite(
  testSuite: TestSuite,
  options: Partial<SynthesizeOptions>,
) {
  return synthesize({
    ...options,
    prompts: testSuite.prompts.map((prompt) => prompt.raw),
  });
}

export async function synthesize({
  prompts,
  injectVar,
  purpose: purposeOverride,
}: SynthesizeOptions) {
  const reasoningProvider = new OpenAiChatCompletionProvider(SYNTHESIS_MODEL);

  // Progressbar
  let spinner;
  if (process.env.LOG_LEVEL !== 'debug') {
    spinner = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    spinner.start(100, 0, {
      speed: 'N/A',
    });
  }

  // Get vars
  // const vars = prompts.flatMap(extractNunjucksVariables);
  // console.log('Variables:', vars);
  injectVar = injectVar || 'query';

  // Get purpose
  if (spinner) spinner.update(5, { speed: 'Querying purpose' });
  const purpose = purposeOverride || (await getPurpose(prompts, reasoningProvider));
  if (spinner) spinner.update(10, { speed: 'Purpose acquired' });

  logger.debug(`System purpose: ${purpose}`);

  // Get adversarial test cases
  if (spinner) spinner.update(15, { speed: 'Generating adversarial tests' });

  const testCases: TestCase[] = [];

  logger.debug('Generating harmful test cases');
  const adversarialPrompts = await getHarmfulTests(purpose, injectVar);
  testCases.push(...adversarialPrompts);
  logger.debug(`Added ${adversarialPrompts.length} harmful test cases`);

  if (spinner) spinner.update(25, { speed: 'Injecting adversarial tests' });
  logger.debug('Adding injections to adversarial prompts');
  const injectedPrompts = await addInjections(adversarialPrompts, injectVar);
  testCases.push(...injectedPrompts);
  logger.debug(`Added ${injectedPrompts.length} injected test cases`);

  if (spinner) spinner.update(40, { speed: 'Adding iterative jailbreaks' });
  logger.debug('Adding iterative jailbreaks to adversarial prompts');
  const redTeamConversations = await addIterativeJailbreaks(adversarialPrompts, injectVar);
  testCases.push(...redTeamConversations);
  logger.debug(`Added ${redTeamConversations.length} iterative jailbreak test cases`);

  if (spinner) spinner.update(60, { speed: 'Generating hijacking tests' });
  logger.debug('Generating hijacking tests');
  const hijackingTests = await getHijackingTests(purpose, injectVar);
  testCases.push(...hijackingTests);
  logger.debug(`Added ${hijackingTests.length} hijacking test cases`);

  if (spinner) spinner.update(70, { speed: 'Generating hallucination tests' });
  logger.debug('Generating hallucination tests');
  const hallucinationTests = await getHallucinationTests(purpose, injectVar);
  testCases.push(...hallucinationTests);
  logger.debug(`Added ${hallucinationTests.length} hallucination test cases`);

  if (spinner) spinner.update(80, { speed: 'Generating overconfidence tests' });
  logger.debug('Generating overconfidence tests');
  const overconfidenceTests = await getOverconfidenceTests(purpose, injectVar);
  testCases.push(...overconfidenceTests);
  logger.debug(`Added ${overconfidenceTests.length} overconfidence test cases`);

  if (spinner) spinner.update(90, { speed: 'Generating underconfidence tests' });
  logger.debug('Generating underconfidence tests');
  const underconfidenceTests = await getUnderconfidenceTests(purpose, injectVar);
  testCases.push(...underconfidenceTests);
  logger.debug(`Added ${underconfidenceTests.length} underconfidence test cases`);
  if (spinner) {
    spinner.update(100, { speed: 'Tests generated' });
    spinner.stop();
  }

  return testCases;
}

async function getPurpose(prompts: string[], reasoningProvider: ApiProvider) {
  let { output: purpose } =
    await reasoningProvider.callApi(dedent`The following are prompts that are being used to test an LLM application:
    
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
