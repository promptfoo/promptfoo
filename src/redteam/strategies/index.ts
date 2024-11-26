import chalk from 'chalk';
import dedent from 'dedent';
import path from 'path';
import cliState from '../../cliState';
import { importModule } from '../../esm';
import logger from '../../logger';
import type { RedteamStrategyObject, TestCase, TestCaseWithPlugin } from '../../types';
import { isJavascriptFile } from '../../util/file';
import { addBase64Encoding } from './base64';
import { addCitationTestCases } from './citation';
import { addCrescendo } from './crescendo';
import { addGoatTestCases } from './goat';
import { addIterativeJailbreaks } from './iterative';
import { addLeetspeak } from './leetspeak';
import { addMathPrompt } from './mathPrompt';
import { addMultilingual } from './multilingual';
import { addInjections } from './promptInjections';
import { addRot13 } from './rot13';
import { addCompositeTestCases } from './singleTurnComposite';

export interface Strategy {
  id: string;
  action: (
    testCases: TestCaseWithPlugin[],
    injectVar: string,
    config: Record<string, any>,
  ) => Promise<TestCase[]>;
}

export const Strategies: Strategy[] = [
  {
    id: 'base64',
    action: async (testCases, injectVar) => {
      logger.debug('Adding Base64 encoding to all test cases');
      const newTestCases = addBase64Encoding(testCases, injectVar);
      logger.debug(`Added ${newTestCases.length} Base64 encoded test cases`);
      return newTestCases;
    },
  },
  {
    id: 'crescendo',
    action: async (testCases, injectVar, config) => {
      logger.debug('Adding Crescendo to all test cases');
      const newTestCases = addCrescendo(testCases, injectVar, config);
      logger.debug(`Added ${newTestCases.length} Crescendo test cases`);
      return newTestCases;
    },
  },
  {
    id: 'goat',
    action: async (testCases, injectVar, config) => {
      logger.debug('Adding GOAT to all test cases');
      const newTestCases = await addGoatTestCases(testCases, injectVar, config);
      logger.debug(`Added ${newTestCases.length} GOAT test cases`);
      return newTestCases;
    },
  },
  {
    id: 'jailbreak',
    action: async (testCases, injectVar, config) => {
      logger.debug('Adding experimental jailbreaks to all test cases');
      const newTestCases = addIterativeJailbreaks(testCases, injectVar, 'iterative', config);
      logger.debug(`Added ${newTestCases.length} experimental jailbreak test cases`);
      return newTestCases;
    },
  },
  {
    id: 'jailbreak:tree',
    action: async (testCases, injectVar, config) => {
      logger.debug('Adding experimental tree jailbreaks to all test cases');
      const newTestCases = addIterativeJailbreaks(testCases, injectVar, 'iterative:tree', config);
      logger.debug(`Added ${newTestCases.length} experimental tree jailbreak test cases`);
      return newTestCases;
    },
  },
  {
    id: 'leetspeak',
    action: async (testCases, injectVar) => {
      logger.debug('Adding leetspeak encoding to all test cases');
      const newTestCases = addLeetspeak(testCases, injectVar);
      logger.debug(`Added ${newTestCases.length} leetspeak encoded test cases`);
      return newTestCases;
    },
  },
  {
    id: 'math-prompt',
    action: async (testCases, injectVar, config) => {
      logger.debug('Adding MathPrompt encoding to all test cases');
      const newTestCases = await addMathPrompt(testCases, injectVar, config);
      logger.debug(`Added ${newTestCases.length} MathPrompt encoded test cases`);
      return newTestCases;
    },
  },
  {
    id: 'multilingual',
    action: async (testCases, injectVar, config) => {
      logger.debug('Adding multilingual test cases');
      const newTestCases = await addMultilingual(testCases, injectVar, config);
      logger.debug(`Added ${newTestCases.length} multilingual test cases`);
      return newTestCases;
    },
  },
  {
    id: 'prompt-injection',
    action: async (testCases, injectVar, config) => {
      logger.debug('Adding prompt injections to all test cases');
      const newTestCases = await addInjections(testCases, injectVar, config);
      logger.debug(`Added ${newTestCases.length} prompt injection test cases`);
      return newTestCases;
    },
  },
  {
    id: 'rot13',
    action: async (testCases, injectVar) => {
      logger.debug('Adding ROT13 encoding to all test cases');
      const newTestCases = addRot13(testCases, injectVar);
      logger.debug(`Added ${newTestCases.length} ROT13 encoded test cases`);
      return newTestCases;
    },
  },
  {
    id: 'citation',
    action: async (testCases, injectVar, config) => {
      logger.debug('Adding Citation to all test cases');
      const newTestCases = await addCitationTestCases(testCases, injectVar, config);
      logger.debug(`Added ${newTestCases.length} Citation test cases`);
      return newTestCases;
    },
  },
  {
    id: 'jailbreak:composite',
    action: async (testCases, injectVar, config) => {
      logger.debug('Adding composite jailbreak test cases');
      const newTestCases = await addCompositeTestCases(testCases, injectVar, config);
      logger.debug(`Added ${newTestCases.length} composite jailbreak test cases`);
      return newTestCases;
    },
  },
];

export async function validateStrategies(strategies: RedteamStrategyObject[]): Promise<void> {
  const invalidStrategies = [];

  for (const strategy of strategies) {
    // Skip validation for file:// strategies since they're loaded dynamically
    if (strategy.id.startsWith('file://')) {
      continue;
    }

    if (!Strategies.map((s) => s.id).includes(strategy.id)) {
      invalidStrategies.push(strategy);
    }
  }

  if (invalidStrategies.length > 0) {
    const validStrategiesString = Strategies.map((s) => s.id).join(', ');
    const invalidStrategiesString = invalidStrategies.map((s) => s.id).join(', ');
    logger.error(
      dedent`Invalid strategy(s): ${invalidStrategiesString}.

        ${chalk.green(`Valid strategies are: ${validStrategiesString}`)}`,
    );
    process.exit(1);
  }
}

export async function loadStrategy(strategyPath: string): Promise<Strategy> {
  if (strategyPath.startsWith('file://')) {
    const filePath = strategyPath.slice('file://'.length);
    if (!isJavascriptFile(filePath)) {
      throw new Error(`Custom strategy file must be a JavaScript file: ${filePath}`);
    }

    const basePath = cliState.basePath || process.cwd();
    const modulePath = path.isAbsolute(filePath) ? filePath : path.join(basePath, filePath);
    const CustomStrategy = (await importModule(modulePath)) as Strategy;

    // Validate that the custom strategy implements the Strategy interface
    if (!CustomStrategy.id || typeof CustomStrategy.action !== 'function') {
      throw new Error(
        `Custom strategy in ${filePath} must export an object with 'key' and 'action' properties`,
      );
    }

    return CustomStrategy;
  }

  const strategy = Strategies.find((s) => s.id === strategyPath);
  if (!strategy) {
    throw new Error(`Strategy not found: ${strategyPath}`);
  }

  return strategy;
}
