import cliState from '../../cliState';
import { importModule } from '../../esm';
import logger from '../../logger';
import { isJavascriptFile } from '../../util/fileExtensions';
import { safeJoin } from '../../util/pathUtils';
import { isCustomStrategy } from '../constants/strategies';
import { addAuthoritativeMarkupInjectionTestCases } from './authoritativeMarkupInjection';
import { addBase64Encoding } from './base64';
import { addBestOfNTestCases } from './bestOfN';
import { addCitationTestCases } from './citation';
import { addCrescendo } from './crescendo';
import { addCustom } from './custom';
import { addGcgTestCases } from './gcg';
import { addGoatTestCases } from './goat';
import { addHexEncoding } from './hex';
import { addHomoglyphs } from './homoglyph';
import { addHydra } from './hydra';
import { addIndirectWebPwnTestCases } from './indirectWebPwn';
import { addIterativeJailbreaks } from './iterative';
import { addLayerTestCases } from './layer';
import { addLeetspeak } from './leetspeak';
import { addLikertTestCases } from './likert';
import { addMathPrompt } from './mathPrompt';
import { addMischievousUser } from './mischievousUser';
import { addOtherEncodings, EncodingType } from './otherEncodings';
import { addInjections } from './promptInjections/index';
import { addRetryTestCases } from './retry';
import { addRot13 } from './rot13';
import { addSimbaTestCases } from './simba';
import { addAudioToBase64 } from './simpleAudio';
import { addImageToBase64 } from './simpleImage';
import { addVideoToBase64 } from './simpleVideo';
import { addCompositeTestCases } from './singleTurnComposite';

import type { RedteamStrategyObject, TestCase } from '../../types/index';
import type { Strategy } from './types';

export type { Strategy };

export const Strategies: Strategy[] = [
  {
    id: 'layer',
    action: async (testCases, injectVar, config) => {
      logger.debug(`Adding Layer strategy to ${testCases.length} test cases`);
      const newTestCases = await addLayerTestCases(
        testCases,
        injectVar,
        config,
        Strategies,
        loadStrategy,
      );
      logger.debug(`Added ${newTestCases.length} Layer test cases`);
      return newTestCases;
    },
  },
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
    action: async (_testCases: TestCase[], _injectVar: string, _config?: Record<string, any>) => {
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
    id: 'indirect-web-pwn',
    action: async (testCases, injectVar, config) => {
      logger.debug(`Adding Indirect Web Pwn to ${testCases.length} test cases`);
      const newTestCases = await addIndirectWebPwnTestCases(testCases, injectVar, config);
      logger.debug(`Added ${newTestCases.length} Indirect Web Pwn test cases`);
      return newTestCases;
    },
  },
  {
    id: 'authoritative-markup-injection',
    action: async (testCases, injectVar, config) => {
      logger.debug(`Adding Authoritative Markup Injection to ${testCases.length} test cases`);
      const newTestCases = await addAuthoritativeMarkupInjectionTestCases(
        testCases,
        injectVar,
        config,
      );
      logger.debug(`Added ${newTestCases.length} Authoritative Markup Injection test cases`);
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
    id: 'jailbreak:meta',
    action: async (testCases, injectVar, config) => {
      logger.debug(`Adding meta-agent jailbreaks to ${testCases.length} test cases`);
      const newTestCases = addIterativeJailbreaks(testCases, injectVar, 'iterative:meta', config);
      logger.debug(`Added ${newTestCases.length} meta-agent jailbreak test cases`);
      return newTestCases;
    },
  },
  {
    id: 'jailbreak:hydra',
    action: async (testCases, injectVar, config) => {
      logger.debug(`Adding hydra multi-turn jailbreaks to ${testCases.length} test cases`);
      const newTestCases = addHydra(testCases, injectVar, config);
      logger.debug(`Added ${newTestCases.length} hydra jailbreak test cases`);
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
    id: 'jailbreak-templates',
    action: async (testCases, injectVar, config) => {
      logger.debug(`Adding jailbreak templates to ${testCases.length} test cases`);
      const newTestCases = await addInjections(testCases, injectVar, config);
      logger.debug(`Added ${newTestCases.length} jailbreak template test cases`);
      return newTestCases;
    },
  },
  {
    // Deprecated: Use 'jailbreak-templates' instead. This alias exists for backward compatibility.
    id: 'prompt-injection',
    action: async (testCases, injectVar, config) => {
      logger.warn(
        'Strategy "prompt-injection" is deprecated. Use "jailbreak-templates" instead. ' +
          'This strategy applies static jailbreak templates and does not cover modern prompt injection techniques.',
      );
      const newTestCases = await addInjections(testCases, injectVar, config);
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
    // Deprecated: Simba strategy has been removed. This entry exists for backwards compatibility.
    id: 'simba',
    action: async (testCases, injectVar, config) => {
      return addSimbaTestCases(testCases, injectVar, config);
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
      if (!strategy.config?.strategyText || typeof strategy.config.strategyText !== 'string') {
        throw new Error('Custom strategy requires strategyText in config');
      }
      continue;
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
    throw new Error(
      `Invalid strategy(s): ${invalidStrategiesString}. Valid strategies are: ${validStrategiesString}`,
    );
  }
}

export async function loadStrategy(strategyPath: string): Promise<Strategy> {
  if (strategyPath.startsWith('file://')) {
    const filePath = strategyPath.slice('file://'.length);
    if (!isJavascriptFile(filePath)) {
      throw new Error(`Custom strategy file must be a JavaScript file: ${filePath}`);
    }

    const modulePath = safeJoin(cliState.basePath || process.cwd(), filePath);
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
