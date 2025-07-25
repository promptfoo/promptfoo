import path from 'path';

import chalk from 'chalk';
import dedent from 'dedent';
import cliState from '../../cliState';
import { importModule } from '../../esm';
import logger from '../../logger';
import { isJavascriptFile } from '../../util/fileExtensions';
import { isCustomStrategy } from '../constants/strategies';
import { addBase64Encoding } from './base64';
import { addBestOfNTestCases } from './bestOfN';
import { addCitationTestCases } from './citation';
import { addCrescendo } from './crescendo';
import { addCustom } from './custom';
import { addGcgTestCases } from './gcg';
import { addGoatTestCases } from './goat';
import { addHexEncoding } from './hex';
import { addHomoglyphs } from './homoglyph';
import { addIterativeJailbreaks } from './iterative';
import { addLeetspeak } from './leetspeak';
import { addLikertTestCases } from './likert';
import { addMathPrompt } from './mathPrompt';
import { addMischievousUser } from './mischievousUser';
import { addMultilingual } from './multilingual';
import { addOtherEncodings, EncodingType } from './otherEncodings';
import { addPandamonium } from './pandamonium';
import { addInjections } from './promptInjections';
import { addRetryTestCases } from './retry';
import { addRot13 } from './rot13';
import { addAudioToBase64 } from './simpleAudio';
import { addImageToBase64 } from './simpleImage';
import { addVideoToBase64 } from './simpleVideo';
import { addCompositeTestCases } from './singleTurnComposite';

import type { RedteamStrategyObject, TestCase, TestCaseWithPlugin } from '../../types';

export interface Strategy {
  id: string;
  action: (
    testCases: TestCaseWithPlugin[],
    injectVar: string,
    config: Record<string, any>,
    strategyId?: string,
  ) => Promise<TestCase[]>;
}

export const Strategies: Strategy[] = [
  {
    id: 'base64',
    action: async (testCases, injectVar) => {
      logger.debug(`Adding Base64 encoding to ${testCases.length} test cases`);
      const newTestCases = addBase64Encoding(testCases, injectVar);
      logger.debug(`Added ${newTestCases.length} Base64 encoded test cases`);
      return newTestCases;
    },
  },
  {
    id: 'homoglyph',
    action: async (testCases, injectVar) => {
      logger.debug(`Adding Homoglyph encoding to ${testCases.length} test cases`);
      const newTestCases = addHomoglyphs(testCases, injectVar);
      logger.debug(`Added ${newTestCases.length} Homoglyph encoded test cases`);
      return newTestCases;
    },
  },
  {
    id: 'basic',
    action: async (testCases: TestCase[], injectVar: string, config?: Record<string, any>) => {
      // Basic strategy doesn't modify test cases, it just controls whether they're included
      // The actual filtering happens in synthesize()
      return [];
    },
  },
  {
    id: 'best-of-n',
    action: async (testCases, injectVar, config) => {
      logger.debug(`Adding Best-of-N to ${testCases.length} test cases`);
      const newTestCases = await addBestOfNTestCases(testCases, injectVar, config);
      logger.debug(`Added ${newTestCases.length} Best-of-N test cases`);
      return newTestCases;
    },
  },
  {
    id: 'citation',
    action: async (testCases, injectVar, config) => {
      logger.debug(`Adding Citation to ${testCases.length} test cases`);
      const newTestCases = await addCitationTestCases(testCases, injectVar, config);
      logger.debug(`Added ${newTestCases.length} Citation test cases`);
      return newTestCases;
    },
  },
  {
    id: 'crescendo',
    action: async (testCases, injectVar, config) => {
      logger.debug(`Adding Crescendo to ${testCases.length} test cases`);
      const newTestCases = addCrescendo(testCases, injectVar, config);
      logger.debug(`Added ${newTestCases.length} Crescendo test cases`);
      return newTestCases;
    },
  },
  {
    id: 'custom',
    action: async (testCases, injectVar, config, strategyId = 'custom') => {
      logger.debug(`Adding Custom to ${testCases.length} test cases`);
      const newTestCases = addCustom(testCases, injectVar, config, strategyId);
      logger.debug(`Added ${newTestCases.length} Custom test cases`);
      return newTestCases;
    },
  },
  {
    id: 'gcg',
    action: async (testCases, injectVar, config) => {
      logger.debug(`Adding GCG test cases to ${testCases.length} test cases`);
      const newTestCases = await addGcgTestCases(testCases, injectVar, config);
      logger.debug(`Added ${newTestCases.length} GCG test cases`);
      return newTestCases;
    },
  },
  {
    id: 'goat',
    action: async (testCases, injectVar, config) => {
      logger.debug(`Adding GOAT to ${testCases.length} test cases`);
      const newTestCases = await addGoatTestCases(testCases, injectVar, config);
      logger.debug(`Added ${newTestCases.length} GOAT test cases`);
      return newTestCases;
    },
  },
  {
    id: 'mischievous-user',
    action: async (testCases, injectVar, config) => {
      logger.debug(`Adding mischievous user test cases to ${testCases.length} test cases`);
      const newTestCases = addMischievousUser(testCases, injectVar, config);
      logger.debug(`Added ${newTestCases.length} mischievous user test cases`);
      return newTestCases;
    },
  },
  {
    id: 'hex',
    action: async (testCases, injectVar) => {
      logger.debug(`Adding Hex encoding to ${testCases.length} test cases`);
      const newTestCases = addHexEncoding(testCases, injectVar);
      logger.debug(`Added ${newTestCases.length} Hex encoded test cases`);
      return newTestCases;
    },
  },
  {
    id: 'jailbreak',
    action: async (testCases, injectVar, config) => {
      logger.debug(`Adding experimental jailbreaks to ${testCases.length} test cases`);
      const newTestCases = addIterativeJailbreaks(testCases, injectVar, 'iterative', config);
      logger.debug(`Added ${newTestCases.length} experimental jailbreak test cases`);
      return newTestCases;
    },
  },
  {
    id: 'jailbreak:composite',
    action: async (testCases, injectVar, config) => {
      logger.debug(`Adding composite jailbreak test cases to ${testCases.length} test cases`);
      const newTestCases = await addCompositeTestCases(testCases, injectVar, config);
      logger.debug(`Added ${newTestCases.length} composite jailbreak test cases`);
      return newTestCases;
    },
  },
  {
    id: 'jailbreak:likert',
    action: async (testCases, injectVar, config) => {
      logger.debug(`Adding Likert scale jailbreaks to ${testCases.length} test cases`);
      const newTestCases = await addLikertTestCases(testCases, injectVar, config);
      logger.debug(`Added ${newTestCases.length} Likert scale jailbreak test cases`);
      return newTestCases;
    },
  },
  {
    id: 'jailbreak:tree',
    action: async (testCases, injectVar, config) => {
      logger.debug(`Adding experimental tree jailbreaks to ${testCases.length} test cases`);
      const newTestCases = addIterativeJailbreaks(testCases, injectVar, 'iterative:tree', config);
      logger.debug(`Added ${newTestCases.length} experimental tree jailbreak test cases`);
      return newTestCases;
    },
  },
  {
    id: 'image',
    action: async (testCases, injectVar) => {
      logger.debug(`Adding image encoding to ${testCases.length} test cases`);
      const newTestCases = await addImageToBase64(testCases, injectVar);
      logger.debug(`Added ${newTestCases.length} image encoded test cases`);
      return newTestCases;
    },
  },
  {
    id: 'audio',
    action: async (testCases, injectVar, config) => {
      logger.debug(`Adding audio encoding to ${testCases.length} test cases`);
      const newTestCases = await addAudioToBase64(testCases, injectVar, config);
      logger.debug(`Added ${newTestCases.length} audio encoded test cases`);
      return newTestCases;
    },
  },
  {
    id: 'video',
    action: async (testCases, injectVar) => {
      logger.debug(`Adding video encoding to ${testCases.length} test cases`);
      const newTestCases = await addVideoToBase64(testCases, injectVar);
      logger.debug(`Added ${newTestCases.length} video encoded test cases`);
      return newTestCases;
    },
  },
  {
    id: 'leetspeak',
    action: async (testCases, injectVar) => {
      logger.debug(`Adding leetspeak encoding to ${testCases.length} test cases`);
      const newTestCases = addLeetspeak(testCases, injectVar);
      logger.debug(`Added ${newTestCases.length} leetspeak encoded test cases`);
      return newTestCases;
    },
  },
  {
    id: 'math-prompt',
    action: async (testCases, injectVar, config) => {
      logger.debug(`Adding MathPrompt encoding to ${testCases.length} test cases`);
      const newTestCases = await addMathPrompt(testCases, injectVar, config);
      logger.debug(`Added ${newTestCases.length} MathPrompt encoded test cases`);
      return newTestCases;
    },
  },
  {
    id: 'multilingual',
    action: async (testCases, injectVar, config) => {
      logger.debug(`Adding multilingual test cases to ${testCases.length} test cases`);
      const newTestCases = await addMultilingual(testCases, injectVar, config);
      logger.debug(`Added ${newTestCases.length} multilingual test cases`);
      return newTestCases;
    },
  },
  {
    id: 'pandamonium',
    action: async (testCases, injectVar, config) => {
      logger.debug(`Adding pandamonium runs to ${testCases.length} test cases`);
      const newTestCases = await addPandamonium(testCases, injectVar, config);
      logger.debug(`Added ${newTestCases.length} Pandamonium test cases`);
      return newTestCases;
    },
  },
  {
    id: 'prompt-injection',
    action: async (testCases, injectVar, config) => {
      logger.debug(`Adding prompt injections to ${testCases.length} test cases`);
      const newTestCases = await addInjections(testCases, injectVar, config);
      logger.debug(`Added ${newTestCases.length} prompt injection test cases`);
      return newTestCases;
    },
  },
  {
    id: 'retry',
    action: async (testCases, injectVar, config) => {
      logger.debug(`Adding retry test cases to ${testCases.length} test cases`);
      const newTestCases = await addRetryTestCases(testCases, injectVar, config);
      logger.debug(`Added ${newTestCases.length} retry test cases`);
      return newTestCases;
    },
  },
  {
    id: 'rot13',
    action: async (testCases, injectVar) => {
      logger.debug(`Adding ROT13 encoding to ${testCases.length} test cases`);
      const newTestCases = addRot13(testCases, injectVar);
      logger.debug(`Added ${newTestCases.length} ROT13 encoded test cases`);
      return newTestCases;
    },
  },
  {
    id: 'morse',
    action: async (testCases, injectVar) => {
      logger.debug(`Adding Morse code encoding to ${testCases.length} test cases`);
      const newTestCases = addOtherEncodings(testCases, injectVar, EncodingType.MORSE);
      logger.debug(`Added ${newTestCases.length} Morse code encoded test cases`);
      return newTestCases;
    },
  },
  {
    id: 'piglatin',
    action: async (testCases, injectVar) => {
      logger.debug(`Adding Pig Latin encoding to ${testCases.length} test cases`);
      const newTestCases = addOtherEncodings(testCases, injectVar, EncodingType.PIG_LATIN);
      logger.debug(`Added ${newTestCases.length} Pig Latin encoded test cases`);
      return newTestCases;
    },
  },
  {
    id: 'camelcase',
    action: async (testCases, injectVar) => {
      logger.debug(`Adding camelCase encoding to ${testCases.length} test cases`);
      const newTestCases = addOtherEncodings(testCases, injectVar, EncodingType.CAMEL_CASE);
      logger.debug(`Added ${newTestCases.length} camelCase encoded test cases`);
      return newTestCases;
    },
  },
  {
    id: 'emoji',
    action: async (testCases, injectVar) => {
      logger.debug(`Adding emoji encoding to ${testCases.length} test cases`);
      const newTestCases = addOtherEncodings(testCases, injectVar, EncodingType.EMOJI);
      logger.debug(`Added ${newTestCases.length} emoji encoded test cases`);
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

    // Check if it's a custom strategy variant (e.g., custom:greeting-strategy)
    if (isCustomStrategy(strategy.id)) {
      continue; // Custom strategies are always valid
    }

    if (!Strategies.map((s) => s.id).includes(strategy.id)) {
      invalidStrategies.push(strategy);
    }

    if (strategy.id === 'basic') {
      if (strategy.config?.enabled !== undefined && typeof strategy.config.enabled !== 'boolean') {
        throw new Error('Basic strategy enabled config must be a boolean');
      }
      continue;
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
