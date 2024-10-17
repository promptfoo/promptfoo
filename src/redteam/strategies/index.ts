import chalk from 'chalk';
import dedent from 'dedent';
import logger from '../../logger';
import type { RedteamStrategyObject, TestCase, TestCaseWithPlugin } from '../../types';
import { addBase64Encoding } from './base64';
import { addCrescendo } from './crescendo';
import { addIterativeJailbreaks } from './iterative';
import { addLeetspeak } from './leetspeak';
import { addMathPrompt } from './mathPrompt';
import { addMultilingual } from './multilingual';
import { addInjections } from './promptInjections';
import { addRot13 } from './rot13';

export interface Strategy {
  key: string;
  action: (
    testCases: TestCaseWithPlugin[],
    injectVar: string,
    config: Record<string, any>,
  ) => Promise<TestCase[]>;
}

export const Strategies: Strategy[] = [
  {
    key: 'jailbreak',
    action: async (testCases, injectVar) => {
      logger.debug('Adding experimental jailbreaks to all test cases');
      const newTestCases = addIterativeJailbreaks(testCases, injectVar, 'iterative');
      logger.debug(`Added ${newTestCases.length} experimental jailbreak test cases`);
      return newTestCases;
    },
  },
  {
    key: 'prompt-injection',
    action: async (testCases, injectVar, config) => {
      logger.debug('Adding prompt injections to all test cases');
      const newTestCases = await addInjections(testCases, injectVar, config);
      logger.debug(`Added ${newTestCases.length} prompt injection test cases`);
      return newTestCases;
    },
  },
  {
    key: 'jailbreak:tree',
    action: async (testCases, injectVar) => {
      logger.debug('Adding experimental tree jailbreaks to all test cases');
      const newTestCases = addIterativeJailbreaks(testCases, injectVar, 'iterative:tree');
      logger.debug(`Added ${newTestCases.length} experimental tree jailbreak test cases`);
      return newTestCases;
    },
  },
  {
    key: 'rot13',
    action: async (testCases, injectVar) => {
      logger.debug('Adding ROT13 encoding to all test cases');
      const newTestCases = addRot13(testCases, injectVar);
      logger.debug(`Added ${newTestCases.length} ROT13 encoded test cases`);
      return newTestCases;
    },
  },
  {
    key: 'leetspeak',
    action: async (testCases, injectVar) => {
      logger.debug('Adding leetspeak encoding to all test cases');
      const newTestCases = addLeetspeak(testCases, injectVar);
      logger.debug(`Added ${newTestCases.length} leetspeak encoded test cases`);
      return newTestCases;
    },
  },
  {
    key: 'base64',
    action: async (testCases, injectVar) => {
      logger.debug('Adding Base64 encoding to all test cases');
      const newTestCases = addBase64Encoding(testCases, injectVar);
      logger.debug(`Added ${newTestCases.length} Base64 encoded test cases`);
      return newTestCases;
    },
  },
  {
    key: 'crescendo',
    action: async (testCases, injectVar) => {
      logger.debug('Adding Crescendo to all test cases');
      const newTestCases = addCrescendo(testCases, injectVar);
      logger.debug(`Added ${newTestCases.length} Crescendo test cases`);
      return newTestCases;
    },
  },
  {
    key: 'multilingual',
    action: async (testCases, injectVar, config) => {
      logger.debug('Adding multilingual test cases');
      const newTestCases = await addMultilingual(testCases, injectVar, config);
      logger.debug(`Added ${newTestCases.length} multilingual test cases`);
      return newTestCases;
    },
  },
  {
    key: 'math-prompt',
    action: async (testCases, injectVar, config) => {
      logger.debug('Adding MathPrompt encoding to all test cases');
      const newTestCases = await addMathPrompt(testCases, injectVar, config);
      logger.debug(`Added ${newTestCases.length} MathPrompt encoded test cases`);
      return newTestCases;
    },
  },
];

export function validateStrategies(strategies: RedteamStrategyObject[]): void {
  const invalidStrategies = strategies.filter(
    (strategy) => !Strategies.map((s) => s.key).includes(strategy.id),
  );
  if (invalidStrategies.length > 0) {
    const validStrategiesString = Strategies.map((s) => s.key).join(', ');
    const invalidStrategiesString = invalidStrategies.map((s) => s.id).join(', ');
    logger.error(
      dedent`Invalid strategy(s): ${invalidStrategiesString}. 
        
        ${chalk.green(`Valid strategies are: ${validStrategiesString}`)}`,
    );
    process.exit(1);
  }
}
