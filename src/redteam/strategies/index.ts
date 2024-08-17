import chalk from 'chalk';
import dedent from 'dedent';
import logger from '../../logger';
import type { TestCase, TestCaseWithPlugin } from '../../types';
import { addBase64Encoding } from './base64';
import { addCrescendo } from './crescendo';
import { addInjections } from './injections';
import { addIterativeJailbreaks } from './iterative';
import { addLeetspeak } from './leetspeak';
import { addRot13 } from './rot13';

interface Strategy {
  key: string;
  action: (testCases: TestCaseWithPlugin[], injectVar: string) => TestCase[];
}

export const Strategies: Strategy[] = [
  {
    key: 'jailbreak',
    action: (testCases, injectVar) => {
      logger.debug('Adding experimental jailbreaks to all test cases');
      const newTestCases = addIterativeJailbreaks(testCases, injectVar, 'iterative');
      logger.debug(`Added ${newTestCases.length} experimental jailbreak test cases`);
      return newTestCases;
    },
  },
  {
    key: 'prompt-injection',
    action: (testCases, injectVar) => {
      const harmfulPrompts = testCases.filter((t) => t.metadata.pluginId.startsWith('harmful:'));
      logger.debug('Adding prompt injections to `harmful` plugin test cases');
      const newTestCases = addInjections(harmfulPrompts, injectVar);
      logger.debug(`Added ${newTestCases.length} prompt injection test cases`);
      return newTestCases;
    },
  },
  {
    key: 'jailbreak:tree',
    action: (testCases, injectVar) => {
      logger.debug('Adding experimental tree jailbreaks to all test cases');
      const newTestCases = addIterativeJailbreaks(testCases, injectVar, 'iterative:tree');
      logger.debug(`Added ${newTestCases.length} experimental tree jailbreak test cases`);
      return newTestCases;
    },
  },
  {
    key: 'rot13',
    action: (testCases, injectVar) => {
      logger.debug('Adding ROT13 encoding to all test cases');
      const newTestCases = addRot13(testCases, injectVar);
      logger.debug(`Added ${newTestCases.length} ROT13 encoded test cases`);
      return newTestCases;
    },
  },
  {
    key: 'leetspeak',
    action: (testCases, injectVar) => {
      logger.debug('Adding leetspeak encoding to all test cases');
      const newTestCases = addLeetspeak(testCases, injectVar);
      logger.debug(`Added ${newTestCases.length} leetspeak encoded test cases`);
      return newTestCases;
    },
  },
  {
    key: 'base64',
    action: (testCases, injectVar) => {
      logger.debug('Adding Base64 encoding to all test cases');
      const newTestCases = addBase64Encoding(testCases, injectVar);
      logger.debug(`Added ${newTestCases.length} Base64 encoded test cases`);
      return newTestCases;
    },
  },
  {
    key: 'crescendo',
    action: (testCases, injectVar) => {
      logger.debug('Adding Crescendo to all test cases');
      const newTestCases = addCrescendo(testCases, injectVar);
      logger.debug(`Added ${newTestCases.length} Crescendo test cases`);
      return newTestCases;
    },
  },
];

export function validateStrategies(strategies: { id: string }[]): void {
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
