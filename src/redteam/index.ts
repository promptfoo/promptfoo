import * as fs from 'fs';

import async from 'async';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import Table from 'cli-table3';
import yaml from 'js-yaml';
import cliState from '../cliState';
import { getEnvString } from '../envars';
import logger, { getLogLevel } from '../logger';
import { checkRemoteHealth } from '../util/apiHealth';
import invariant from '../util/invariant';
import { extractVariablesFromTemplates } from '../util/templates';
import {
  ALIASED_PLUGIN_MAPPINGS,
  BIAS_PLUGINS,
  DATASET_EXEMPT_PLUGINS,
  FINANCIAL_PLUGINS,
  FOUNDATION_PLUGINS,
  getDefaultNFanout,
  HARM_PLUGINS,
  INSURANCE_PLUGINS,
  isFanoutStrategy,
  MEDICAL_PLUGINS,
  MULTI_INPUT_EXCLUDED_PLUGINS,
  MULTI_INPUT_VAR,
  PHARMACY_PLUGINS,
  PII_PLUGINS,
  riskCategorySeverityMap,
  Severity,
  STRATEGY_COLLECTION_MAPPINGS,
  STRATEGY_COLLECTIONS,
  TELECOM_PLUGINS,
} from './constants';
import { extractEntities } from './extraction/entities';
import { extractSystemPurpose } from './extraction/purpose';
import { CustomPlugin } from './plugins/custom';
import { Plugins } from './plugins/index';
import { isValidPolicyObject, makeInlinePolicyIdSync } from './plugins/policy/utils';
import { redteamProviderManager } from './providers/shared';
import { getRemoteHealthUrl, shouldGenerateRemote } from './remoteGeneration';
import { validateSharpDependency } from './sharpAvailability';
import { loadStrategy, Strategies, validateStrategies } from './strategies/index';
import { pluginMatchesStrategyTargets } from './strategies/util';
import { extractGoalFromPrompt, extractVariablesFromJson, getShortPluginId } from './util';

import type { TestCase, TestCaseWithPlugin } from '../types/index';
import type {
  FailedPluginInfo,
  Policy,
  RedteamPluginObject,
  RedteamStrategyObject,
  SynthesizeOptions,
} from './types';

function getPolicyText(metadata: TestCase['metadata'] | undefined): string | undefined {
  if (!metadata || metadata.policy === undefined || metadata.policy === null) {
    return undefined;
  }

  const policyValue = metadata.policy as unknown;

  if (typeof policyValue === 'string') {
    return policyValue;
  }

  if (typeof policyValue === 'object') {
    const policyObject = policyValue as { text?: string };
    return typeof policyObject.text === 'string' && policyObject.text.length > 0
      ? policyObject.text
      : undefined;
  }

  return undefined;
}

const MAX_MAX_CONCURRENCY = 20;

/**
 * Gets the severity level for a plugin based on its ID and configuration.
 * @param pluginId - The ID of the plugin.
 * @param pluginConfig - Optional configuration for the plugin.
 * @returns The severity level.
 */
function getPluginSeverity(pluginId: string, pluginConfig?: Record<string, any>): Severity {
  if (pluginConfig?.severity) {
    return pluginConfig.severity;
  }

  const shortId = getShortPluginId(pluginId);
  return shortId in riskCategorySeverityMap
    ? riskCategorySeverityMap[shortId as keyof typeof riskCategorySeverityMap]
    : Severity.Low;
}

// Maximum length for policy text preview in display
const POLICY_PREVIEW_MAX_LENGTH = 20;

/**
 * Truncates and normalizes text for display preview.
 */
function truncateForPreview(text: string): string {
  const normalized = text.trim().replace(/\n+/g, ' ');
  return normalized.length > POLICY_PREVIEW_MAX_LENGTH
    ? normalized.slice(0, POLICY_PREVIEW_MAX_LENGTH) + '...'
    : normalized;
}

/**
 * Generates a unique display ID for a plugin instance.
 * The returned string serves as both the unique key and the human-readable display.
 *
 * For policy plugins, the ID includes a 12-char identifier (hash or UUID prefix) for uniqueness:
 * - Named cloud policy: "Policy Name"
 * - Unnamed cloud policy: "policy [12-char-id]: preview..."
 * - Inline policy: "policy [hash]: preview..."
 *
 * @param plugin - The plugin configuration.
 * @returns A unique display ID string.
 */
function getPluginDisplayId(plugin: { id: string; config?: Record<string, any> }): string {
  if (plugin.id !== 'policy') {
    return plugin.id;
  }

  const policyConfig = plugin.config?.policy;

  // Cloud policy (object with id)
  if (typeof policyConfig === 'object' && policyConfig !== null && policyConfig.id) {
    if (policyConfig.name) {
      return policyConfig.name;
    }
    const shortId = policyConfig.id.replace(/-/g, '').slice(0, 12);
    const preview = policyConfig.text ? truncateForPreview(String(policyConfig.text)) : '';
    return preview ? `policy [${shortId}]: ${preview}` : `policy [${shortId}]`;
  }

  // Inline policy (string)
  if (typeof policyConfig === 'string') {
    const hash = makeInlinePolicyIdSync(policyConfig);
    const preview = truncateForPreview(policyConfig);
    return `policy [${hash}]: ${preview}`;
  }

  return 'policy';
}

/**
 * Determines the status of test generation based on requested and generated counts.
 * @param requested - The number of requested tests.
 * @param generated - The number of generated tests.
 * @returns A colored string indicating the status.
 */
function getStatus(requested: number, generated: number): string {
  if (requested === 0 && generated === 0) {
    return chalk.gray('Skipped');
  }
  if (generated === 0) {
    return chalk.red('Failed');
  }
  if (generated < requested) {
    return chalk.yellow('Partial');
  }
  return chalk.green('Success');
}

/**
 * Generates a report of plugin and strategy results.
 * @param pluginResults - Results from plugin executions (key is the display ID).
 * @param strategyResults - Results from strategy executions.
 * @returns A formatted string containing the report.
 */
function generateReport(
  pluginResults: Record<string, { requested: number; generated: number }>,
  strategyResults: Record<string, { requested: number; generated: number }>,
): string {
  const table = new Table({
    head: ['#', 'Type', 'ID', 'Requested', 'Generated', 'Status'].map((h) =>
      chalk.dim(chalk.white(h)),
    ),
    colWidths: [5, 10, 40, 12, 12, 14],
  });

  let rowIndex = 1;

  Object.entries(pluginResults)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([displayId, { requested, generated }]) => {
      table.push([
        rowIndex++,
        'Plugin',
        displayId,
        requested,
        generated,
        getStatus(requested, generated),
      ]);
    });

  Object.entries(strategyResults)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([id, { requested, generated }]) => {
      table.push([
        rowIndex++,
        'Strategy',
        id,
        requested,
        generated,
        getStatus(requested, generated),
      ]);
    });

  return `\nTest Generation Report:\n${table.toString()}`;
}

/**
 * Resolves top-level file paths in the plugin configuration.
 * @param config - The plugin configuration to resolve.
 * @returns The resolved plugin configuration.
 */
export function resolvePluginConfig(config: Record<string, any> | undefined): Record<string, any> {
  if (!config) {
    return {};
  }

  for (const key in config) {
    const value = config[key];
    if (typeof value === 'string' && value.startsWith('file://')) {
      const filePath = value.slice('file://'.length);

      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      if (filePath.endsWith('.yaml')) {
        config[key] = yaml.load(fs.readFileSync(filePath, 'utf8'));
      } else if (filePath.endsWith('.json')) {
        config[key] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } else {
        config[key] = fs.readFileSync(filePath, 'utf8');
      }
    }
  }
  return config;
}

const categories = {
  foundation: FOUNDATION_PLUGINS,
  harmful: Object.keys(HARM_PLUGINS),
  bias: BIAS_PLUGINS,
  pii: PII_PLUGINS,
  medical: MEDICAL_PLUGINS,
  pharmacy: PHARMACY_PLUGINS,
  insurance: INSURANCE_PLUGINS,
  financial: FINANCIAL_PLUGINS,
  telecom: TELECOM_PLUGINS,
} as const;

/**
 * Formats the test count for display.
 * @param numTests - The number of tests.
 * @param strategy - Whether the test count is for a strategy.
 * @returns A formatted string representing the test count.
 */
const formatTestCount = (numTests: number, strategy: boolean): string =>
  numTests === 1
    ? `1 ${strategy ? 'additional ' : ''}test`
    : `${numTests} ${strategy ? 'additional ' : ''}tests`;

/**
 * Gets the language from a test case's metadata.
 * Checks both metadata.language and metadata.modifiers.language.
 * @param test - The test case to get language from.
 * @returns The language string or undefined if not found.
 */
function getLanguageForTestCase(test: TestCase | undefined): string | undefined {
  if (!test) {
    return undefined;
  }
  return test.metadata?.language || test.metadata?.modifiers?.language;
}

/**
 * Adds comprehensive metadata to plugin test cases including language, plugin info, and severity.
 * @param test - The test case to add metadata to.
 * @param lang - The language for this test.
 * @param plugin - The plugin configuration.
 * @param testGenerationInstructions - Optional test generation instructions.
 * @returns Test case with complete metadata.
 */
function addLanguageToPluginMetadata(
  test: TestCase,
  lang: string | undefined,
  plugin: RedteamPluginObject,
  testGenerationInstructions?: string,
): TestCase {
  const existingLanguage = getLanguageForTestCase(test);
  const languageToAdd = lang && !existingLanguage ? { language: lang } : {};

  // Use modifiers from the test's pluginConfig first (which may have been computed by appendModifiers),
  // then fall back to the original plugin.config?.modifiers
  const pluginModifiers =
    (test.metadata?.pluginConfig?.modifiers as Record<string, string> | undefined) ||
    (plugin.config?.modifiers as Record<string, string> | undefined) ||
    {};

  return {
    ...test,
    metadata: {
      pluginId: plugin.id,
      pluginConfig: resolvePluginConfig(plugin.config),
      severity: plugin.severity ?? getPluginSeverity(plugin.id, resolvePluginConfig(plugin.config)),
      modifiers: {
        ...(testGenerationInstructions ? { testGenerationInstructions } : {}),
        ...pluginModifiers,
        ...test.metadata?.modifiers,
        // Add language to modifiers if not already present (respect existing)
        ...languageToAdd,
      },
      ...test.metadata,
      // Hoist language to top-level metadata for backward compatibility and easier access
      ...languageToAdd,
    },
  };
}

/**
 * Determines whether a strategy should be applied to a test case based on plugin targeting rules.
 *
 * This function evaluates multiple criteria to decide if a strategy matches a test case:
 * - Excludes strategy-exempt plugins (defined in STRATEGY_EXEMPT_PLUGINS)
 * - Excludes sequence providers (which are verbatim and don't support strategies)
 * - Respects plugin-level strategy exclusions via excludeStrategies config
 * - Matches against target plugins through direct ID match or category prefixes
 *
 * @param testCase - The test case containing plugin metadata to evaluate
 * @param strategyId - The ID of the strategy being considered for application
 * @param targetPlugins - Optional array of plugin IDs or categories that the strategy targets.
 *                       If undefined or empty, strategy applies to all non-exempt plugins.
 *                       Supports both exact matches and category prefixes (e.g., 'harmful' matches 'harmful:hate')
 * @returns True if the strategy should be applied to this test case, false otherwise
 */

/**
 * Applies strategies to the test cases.
 * @param testCases - The initial test cases generated by plugins.
 * @param strategies - The strategies to apply.
 * @param injectVar - The variable to inject.
 * @returns An array of new test cases generated by strategies.
 */
async function applyStrategies(
  testCases: TestCaseWithPlugin[],
  strategies: RedteamStrategyObject[],
  injectVar: string,
  excludeTargetOutputFromAgenticAttackGeneration?: boolean,
): Promise<{
  testCases: TestCaseWithPlugin[];
  strategyResults: Record<string, { requested: number; generated: number }>;
}> {
  const newTestCases: TestCaseWithPlugin[] = [];
  const strategyResults: Record<string, { requested: number; generated: number }> = {};

  for (const strategy of strategies) {
    logger.debug(`Generating ${strategy.id} tests`);

    let strategyAction;
    if (strategy.id.startsWith('file://')) {
      const loadedStrategy = await loadStrategy(strategy.id);
      strategyAction = loadedStrategy.action;
    } else {
      // First try to find the exact strategy ID (e.g., jailbreak:composite)
      let builtinStrategy = Strategies.find((s) => s.id === strategy.id);

      // If not found, handle custom strategy variants (e.g., custom:aggressive)
      if (!builtinStrategy && strategy.id.includes(':')) {
        const baseStrategyId = strategy.id.split(':')[0];
        builtinStrategy = Strategies.find((s) => s.id === baseStrategyId);
      }

      if (!builtinStrategy) {
        logger.warn(`Strategy ${strategy.id} not registered, skipping`);
        continue;
      }
      strategyAction = builtinStrategy.action;
    }

    const targetPlugins = strategy.config?.plugins;
    const applicableTestCases = testCases.filter((t) => {
      // Check plugin matching first
      if (!pluginMatchesStrategyTargets(t, strategy.id, targetPlugins)) {
        return false;
      }

      // Skip retry tests - they shouldn't be transformed by strategies
      if (t.metadata?.retry === true) {
        logger.debug(
          `Skipping ${strategy.id} for retry test (plugin: ${t.metadata?.pluginId}) - retry tests are not transformed`,
        );
        return false;
      }

      return true;
    });

    // Apply numTests pre-limit if configured (with defensive check for NaN/Infinity)
    const numTestsLimit = strategy.config?.numTests;
    if (typeof numTestsLimit === 'number' && Number.isFinite(numTestsLimit) && numTestsLimit >= 0) {
      // Early exit for numTests=0 - skip strategy entirely
      if (numTestsLimit === 0) {
        logger.warn(`[Strategy] ${strategy.id}: numTests=0 configured, skipping strategy`);
        continue;
      }
    }

    // Pre-limit test cases before passing to strategy (avoids wasted computation)
    let testCasesToProcess = applicableTestCases;
    if (typeof numTestsLimit === 'number' && Number.isFinite(numTestsLimit) && numTestsLimit > 0) {
      if (applicableTestCases.length > numTestsLimit) {
        logger.debug(
          `[Strategy] ${strategy.id}: Pre-limiting ${applicableTestCases.length} tests to numTests=${numTestsLimit}`,
        );
        testCasesToProcess = applicableTestCases.slice(0, numTestsLimit);
      }
    }

    const strategyTestCases: (TestCase | undefined)[] = await strategyAction(
      testCasesToProcess,
      injectVar,
      {
        ...(strategy.config || {}),
        // Pass redteam provider from config so agentic strategies (iterative, crescendo, etc.) can use it
        redteamProvider: cliState.config?.redteam?.provider,
        excludeTargetOutputFromAgenticAttackGeneration,
      },
      strategy.id,
    );

    // Filter out null/undefined
    let resultTestCases = strategyTestCases.filter(
      (t): t is NonNullable<typeof t> => t !== null && t !== undefined,
    );

    // Post-cap safety net for strategies that generate more outputs than inputs (1:N fan-out)
    if (typeof numTestsLimit === 'number' && Number.isFinite(numTestsLimit) && numTestsLimit > 0) {
      if (resultTestCases.length > numTestsLimit) {
        logger.warn(
          `[Strategy] ${strategy.id}: Post-cap safety net applied (${resultTestCases.length} -> ${numTestsLimit}). Strategy generated more tests than input.`,
        );
        resultTestCases = resultTestCases.slice(0, numTestsLimit);
      }
    }

    newTestCases.push(
      ...resultTestCases.map((t) => {
        // Re-extract individual keys from transformed JSON if inputs was used
        const inputs = t?.metadata?.pluginConfig?.inputs as Record<string, string> | undefined;
        let updatedVars = t.vars;
        if (inputs && Object.keys(inputs).length > 0 && t.vars?.[injectVar]) {
          try {
            const parsed = JSON.parse(String(t.vars[injectVar]));
            updatedVars = { ...t.vars };
            Object.assign(updatedVars, extractVariablesFromJson(parsed, inputs));
          } catch {
            // If parsing fails, keep original vars
          }
        }
        return {
          ...t,
          vars: updatedVars,
          metadata: {
            ...(t?.metadata || {}),
            // Don't set strategyId for retry strategy (it's not user-facing)
            ...(strategy.id !== 'retry' && {
              strategyId: t?.metadata?.strategyId || strategy.id,
            }),
            ...(t?.metadata?.pluginId && { pluginId: t.metadata.pluginId }),
            ...(t?.metadata?.pluginConfig && {
              pluginConfig: t.metadata.pluginConfig,
            }),
            ...(strategy.config && {
              strategyConfig: {
                ...strategy.config,
                ...(t?.metadata?.strategyConfig || {}),
              },
            }),
          },
        };
      }),
    );

    // Compute a display id for reporting (helpful for layered strategies)
    const displayId =
      strategy.id === 'layer' && Array.isArray(strategy.config?.steps)
        ? `layer(${(strategy.config!.steps as any[])
            .map((st) => (typeof st === 'string' ? st : st.id))
            .join('→')})`
        : strategy.id;

    // Check if strategy generated tests across multiple languages
    // Language can be in metadata.language or metadata.modifiers.language
    // Note: Language is passed to strategies via test metadata.modifiers.language from plugin generation
    const languagesInResults = new Set(
      strategyTestCases
        .map((t) => getLanguageForTestCase(t))
        .filter((lang): lang is string => lang !== undefined),
    );

    // Helper to apply numTests cap to requested count (with defensive check for NaN/Infinity)
    const applyNumTestsCap = (calculatedRequested: number): number => {
      const numTestsCap = strategy.config?.numTests;
      if (typeof numTestsCap === 'number' && Number.isFinite(numTestsCap) && numTestsCap >= 0) {
        return Math.min(calculatedRequested, numTestsCap);
      }
      return calculatedRequested;
    };

    if (languagesInResults.size > 1) {
      // Strategy was applied to multilingual tests - break down by language
      // Don't show language suffix for English (en) - it's the default
      const resultsByLanguage: Record<string, { requested: number; generated: number }> = {};

      for (const lang of languagesInResults) {
        const testsForLang = resultTestCases.filter((t) => getLanguageForTestCase(t) === lang);
        const applicableForLang = applicableTestCases.filter(
          (t) => getLanguageForTestCase(t) === lang,
        );

        let n = 1;
        if (typeof strategy.config?.n === 'number') {
          n = strategy.config.n;
        } else if (isFanoutStrategy(strategy.id)) {
          n = getDefaultNFanout(strategy.id);
        }

        resultsByLanguage[lang] = {
          requested: applyNumTestsCap(applicableForLang.length * n),
          generated: testsForLang.length,
        };
      }

      for (const [lang, result] of Object.entries(resultsByLanguage)) {
        const strategyDisplayId = lang === 'en' ? displayId : `${displayId} (${lang})`;
        strategyResults[strategyDisplayId] = result;
      }
    } else if (strategy.id === 'layer') {
      // Layer strategy: requested count is same as applicable test cases
      strategyResults[displayId] = {
        requested: applyNumTestsCap(applicableTestCases.length),
        generated: resultTestCases.length,
      };
    } else {
      // get an accurate 'Requested' count for strategies that add additional tests during generation
      let n = 1;
      if (typeof strategy.config?.n === 'number') {
        n = strategy.config.n;
      } else if (isFanoutStrategy(strategy.id)) {
        n = getDefaultNFanout(strategy.id);
      }

      strategyResults[displayId] = {
        requested: applyNumTestsCap(applicableTestCases.length * n),
        generated: resultTestCases.length,
      };
    }
  }

  return { testCases: newTestCases, strategyResults };
}

/**
 * Helper function to get the test count based on strategy configuration.
 * @param strategy - The strategy object to evaluate.
 * @param totalPluginTests - The total number of plugin tests.
 * @param strategies - The array of strategies.
 * @returns The calculated test count.
 */
export function getTestCount(
  strategy: RedteamStrategyObject,
  totalPluginTests: number,
  _strategies: RedteamStrategyObject[],
): number {
  let count: number;

  // Basic strategy either keeps original count or removes all tests
  if (strategy.id === 'basic') {
    count = strategy.config?.enabled === false ? 0 : totalPluginTests;
  } else if (strategy.id === 'layer') {
    // Layer strategy: returns the same count as plugin tests
    // (plugins already account for language multipliers)
    count = totalPluginTests;
  } else if (strategy.id === 'retry') {
    // Retry strategy has its own numTests handling (additive semantics)
    const configuredNumTests = strategy.config?.numTests as number | undefined;
    const additionalTests = configuredNumTests ?? totalPluginTests;
    return totalPluginTests + additionalTests;
  } else {
    // Apply fan-out multiplier if this is a fan-out strategy
    let n = 1;
    if (typeof strategy.config?.n === 'number') {
      n = strategy.config.n;
    } else if (isFanoutStrategy(strategy.id)) {
      n = getDefaultNFanout(strategy.id);
    }
    count = totalPluginTests * n;
  }

  // Apply numTests cap if configured (for non-retry strategies, with defensive check)
  const numTestsCap = strategy.config?.numTests;
  if (typeof numTestsCap === 'number' && Number.isFinite(numTestsCap) && numTestsCap >= 0) {
    count = Math.min(count, numTestsCap);
  }

  return count;
}

/**
 * Calculates the total number of tests to be generated based on plugins and strategies.
 * @param plugins - The array of plugins to generate tests for
 * @param strategies - The array of strategies to apply
 * @returns Object containing total tests and intermediate calculations
 */
export function calculateTotalTests(
  plugins: SynthesizeOptions['plugins'],
  strategies: RedteamStrategyObject[],
  language?: string | string[],
): {
  effectiveStrategyCount: number;
  includeBasicTests: boolean;
  totalPluginTests: number;
  totalTests: number;
} {
  const retryStrategy = strategies.find((s) => s.id === 'retry');
  const basicStrategy = strategies.find((s) => s.id === 'basic');

  const basicStrategyExists = basicStrategy !== undefined;
  const includeBasicTests = basicStrategy?.config?.enabled ?? true;

  const effectiveStrategyCount =
    basicStrategyExists && !includeBasicTests ? strategies.length - 1 : strategies.length;

  // Calculate total plugin tests accounting for multiple languages
  // Each plugin's tests are multiplied by the number of languages when multiple languages are configured
  const totalPluginTests = plugins.reduce((sum, p) => {
    const pluginLanguageConfig = p.config?.language ?? language;
    const pluginLanguageCount = Array.isArray(pluginLanguageConfig)
      ? pluginLanguageConfig.length
      : 1;
    return sum + (p.numTests || 0) * pluginLanguageCount;
  }, 0);

  // When there are no strategies, or only a disabled basic strategy
  if (
    strategies.length === 0 ||
    (strategies.length === 1 && basicStrategyExists && !includeBasicTests)
  ) {
    return {
      effectiveStrategyCount: 0,
      includeBasicTests: strategies.length === 0 ? true : includeBasicTests,
      totalPluginTests,
      totalTests: includeBasicTests ? totalPluginTests : 0,
    };
  }

  // Start with base test count from basic strategy
  let totalTests = includeBasicTests ? totalPluginTests : 0;

  // Apply retry strategy first if present
  if (retryStrategy) {
    totalTests = getTestCount(retryStrategy, totalTests, strategies);
  }

  // Apply other non-basic, non-retry strategies
  for (const strategy of strategies) {
    if (['basic', 'retry'].includes(strategy.id)) {
      continue;
    }
    // Add the tests from this strategy to the total, not replace the total
    totalTests += getTestCount(strategy, totalPluginTests, strategies);
  }

  return {
    effectiveStrategyCount,
    includeBasicTests,
    totalPluginTests,
    totalTests,
  };
}

/**
 * Type guard to check if a strategy ID is a strategy collection
 */
function isStrategyCollection(id: string): id is keyof typeof STRATEGY_COLLECTION_MAPPINGS {
  return STRATEGY_COLLECTIONS.includes(id as keyof typeof STRATEGY_COLLECTION_MAPPINGS);
}

/**
 * Synthesizes test cases based on provided options.
 * @param options - The options for test case synthesis.
 * @returns A promise that resolves to an object containing the purpose, entities, and test cases.
 */
export async function synthesize({
  abortSignal,
  delay,
  entities: entitiesOverride,
  injectVar,
  inputs,
  language,
  maxConcurrency = 1,
  plugins,
  prompts,
  provider,
  purpose: purposeOverride,
  strategies,
  targetIds,
  showProgressBar: showProgressBarOverride,
  excludeTargetOutputFromAgenticAttackGeneration,
  testGenerationInstructions,
}: SynthesizeOptions): Promise<{
  purpose: string;
  entities: string[];
  testCases: TestCaseWithPlugin[];
  injectVar: string;
  failedPlugins: FailedPluginInfo[];
}> {
  // Add abort check helper
  const checkAbort = () => {
    if (abortSignal?.aborted) {
      throw new Error('Operation cancelled');
    }
  };

  // Add abort checks at key points
  checkAbort();

  if (prompts.length === 0) {
    throw new Error('Prompts array cannot be empty');
  }
  if (delay && maxConcurrency > 1) {
    maxConcurrency = 1;
    logger.warn('Delay is enabled, setting max concurrency to 1.');
  }

  if (maxConcurrency > MAX_MAX_CONCURRENCY) {
    maxConcurrency = MAX_MAX_CONCURRENCY;
    logger.info(`Max concurrency for test generation is capped at ${MAX_MAX_CONCURRENCY}.`);
  }

  const expandedStrategies: typeof strategies = [];
  strategies.forEach((strategy) => {
    if (isStrategyCollection(strategy.id)) {
      const aliasedStrategies = STRATEGY_COLLECTION_MAPPINGS[strategy.id];
      if (aliasedStrategies) {
        aliasedStrategies.forEach((strategyId) => {
          expandedStrategies.push({
            ...strategy,
            id: strategyId,
          });
        });
      } else {
        logger.warn(`Strategy collection ${strategy.id} has no mappings, skipping`);
      }
    } else {
      expandedStrategies.push(strategy);
    }
  });

  // Deduplicate strategies by a key. For most strategies, the key is the id.
  // For 'layer', use label if provided, otherwise include the ordered step ids.
  const seen = new Set<string>();
  const keyForStrategy = (s: (typeof strategies)[number]): string => {
    if (s.id === 'layer' && s.config) {
      const config = s.config as Record<string, unknown>;
      // If label is provided, use it for uniqueness (allows multiple layer strategies)
      if (typeof config.label === 'string' && config.label.trim()) {
        return `layer/${config.label}`;
      }
      // Otherwise use steps for uniqueness
      if (Array.isArray(config.steps)) {
        const steps = (config.steps as Array<string | { id?: string }>).map((st) =>
          typeof st === 'string' ? st : (st?.id ?? 'unknown'),
        );
        return `layer:${steps.join('->')}`;
      }
    }
    return s.id;
  };
  strategies = expandedStrategies.filter((strategy) => {
    const key = keyForStrategy(strategy);
    if (seen.has(key)) {
      logger.debug(`[Synthesize] Skipping duplicate strategy: ${key}`);
      return false;
    }
    seen.add(key);
    return true;
  });

  await validateStrategies(strategies);
  await validateSharpDependency(strategies, plugins);

  const redteamProvider = await redteamProviderManager.getProvider({
    provider,
  });

  const { effectiveStrategyCount, includeBasicTests, totalPluginTests, totalTests } =
    calculateTotalTests(plugins, strategies, language);

  logger.info(
    `Synthesizing test cases for ${prompts.length} ${
      prompts.length === 1 ? 'prompt' : 'prompts'
    }...\nUsing plugins:\n\n${chalk.yellow(
      plugins
        .map((p) => {
          // Calculate actual test count accounting for multiple languages
          const pluginLanguageConfig = p.config?.language ?? language;
          const pluginLanguageCount = Array.isArray(pluginLanguageConfig)
            ? pluginLanguageConfig.length
            : 1;
          const actualTestCount = (p.numTests || 0) * pluginLanguageCount;
          // Build a concise display string for the plugin
          let configSummary = '';
          if (p.config) {
            if (p.id === 'policy') {
              const policy = p.config?.policy as Policy;
              if (isValidPolicyObject(policy)) {
                const policyText = policy.text!.trim().replace(/\n+/g, ' ');
                const truncated =
                  policyText.length > 70 ? policyText.slice(0, 70) + '...' : policyText;
                if (policy.name) {
                  configSummary = ` ${policy.name}:`;
                }
                configSummary += ` "${truncated}"`;
              } else {
                const policyText = policy.trim().replace(/\n+/g, ' ');
                const truncated =
                  policyText.length > 70 ? policyText.slice(0, 70) + '...' : policyText;
                configSummary = truncated;
              }
            } else {
              // For other plugins with config, just indicate config exists
              configSummary = ' (custom config)';
            }
            // Log full config at debug level for troubleshooting (structured for auto-sanitization)
            logger.debug('Plugin config', { pluginId: p.id, config: p.config });
          }
          return `${p.id} (${formatTestCount(actualTestCount, false)})${configSummary}`;
        })
        .sort()
        .join('\n'),
    )}\n`,
  );
  if (strategies.length > 0) {
    logger.info(
      `Using strategies:\n\n${chalk.yellow(
        strategies
          .filter((s) => !['basic', 'retry'].includes(s.id))
          .map((s) => {
            // For non-basic strategies, we want to show the additional tests they generate
            let testCount = totalPluginTests;
            // Apply fan-out multiplier if this is a fan-out strategy
            let n = 1;
            if (typeof s.config?.n === 'number') {
              n = s.config.n;
            } else if (isFanoutStrategy(s.id)) {
              n = getDefaultNFanout(s.id);
            }
            testCount = totalPluginTests * n;
            // Apply numTests cap if configured (consistent with calculateExpectedStrategyTests)
            const numTestsCap = s.config?.numTests;
            if (
              typeof numTestsCap === 'number' &&
              Number.isFinite(numTestsCap) &&
              numTestsCap >= 0
            ) {
              testCount = Math.min(testCount, numTestsCap);
            }
            return `${s.id} (${formatTestCount(testCount, true)})`;
          })
          .sort()
          .join('\n'),
      )}\n`,
    );
  }

  logger.info(
    chalk.bold(`Test Generation Summary:`) +
      `\n• Total tests: ${chalk.cyan(totalTests)}` +
      `\n• Plugin tests: ${chalk.cyan(totalPluginTests)}` +
      `\n• Plugins: ${chalk.cyan(plugins.length)}` +
      `\n• Strategies: ${chalk.cyan(effectiveStrategyCount)}` +
      `\n• Max concurrency: ${chalk.cyan(maxConcurrency)}\n` +
      (delay ? `• Delay: ${chalk.cyan(delay)}\n` : ''),
  );

  // Handle multi-input mode: use MULTI_INPUT_VAR to prevent namespace collisions
  const hasMultipleInputs = inputs && Object.keys(inputs).length > 0;
  if (hasMultipleInputs) {
    const inputKeys = Object.keys(inputs);
    logger.info(
      `Using multi-input mode with ${inputKeys.length} variables: ${inputKeys.join(', ')}`,
    );
    // In multi-input mode, use MULTI_INPUT_VAR to prevent namespace collisions
    // with user-defined input variable names
    injectVar = MULTI_INPUT_VAR;

    // Some plugins don't support multi-input mode; skip them
    const multiInputExcluded = [...DATASET_EXEMPT_PLUGINS, ...MULTI_INPUT_EXCLUDED_PLUGINS];
    const removedPlugins = plugins.filter((p) => multiInputExcluded.includes(p.id as any));
    plugins = plugins.filter((p) => !multiInputExcluded.includes(p.id as any));
    if (removedPlugins.length > 0) {
      logger.info(
        `Skipping ${removedPlugins.length} plugin${removedPlugins.length > 1 ? 's' : ''} in multi-input mode: ${removedPlugins.map((p) => p.id).join(', ')}`,
      );
    }
  }

  // Determine injectVar if not explicitly set (only applies to single-input mode)
  if (typeof injectVar !== 'string') {
    const parsedVars = extractVariablesFromTemplates(prompts);
    if (parsedVars.length > 1) {
      logger.warn(
        `\nMultiple variables found in prompts: ${parsedVars.join(', ')}. Using the last one "${parsedVars[parsedVars.length - 1]}". Override this selection with --injectVar`,
      );
    } else if (parsedVars.length === 0) {
      logger.warn('No variables found in prompts. Using "query" as the inject variable.');
    }
    // Odds are that the last variable is the user input since the user input usually goes at the end of the prompt
    injectVar = parsedVars[parsedVars.length - 1] || 'query';
    invariant(typeof injectVar === 'string', `Inject var must be a string, got ${injectVar}`);
  }

  // Expand plugins first
  for (const [category, categoryPlugins] of Object.entries(categories)) {
    const plugin = plugins.find((p) => p.id === category);
    if (plugin) {
      plugins.push(...categoryPlugins.map((p) => ({ id: p, numTests: plugin.numTests })));
    }
  }

  const expandedPlugins: typeof plugins = [];
  const expandPlugin = (
    plugin: (typeof plugins)[0],
    mapping: { plugins: string[]; strategies: string[] },
  ) => {
    mapping.plugins.forEach((p: string) =>
      expandedPlugins.push({ id: p, numTests: plugin.numTests }),
    );
    strategies.push(...mapping.strategies.map((s: string) => ({ id: s })));
  };

  plugins.forEach((plugin) => {
    // First check if this is a direct plugin that should not be expanded
    // This is for plugins like bias:gender that have a prefix matching an alias
    const isDirectPlugin = Plugins.some((p) => p.key === plugin.id);

    if (isDirectPlugin) {
      expandedPlugins.push(plugin);
      return;
    }

    const mappingKey = Object.keys(ALIASED_PLUGIN_MAPPINGS).find(
      (key) => plugin.id === key || plugin.id.startsWith(`${key}:`),
    );

    if (mappingKey) {
      const mapping =
        ALIASED_PLUGIN_MAPPINGS[mappingKey][plugin.id] ||
        Object.values(ALIASED_PLUGIN_MAPPINGS[mappingKey]).find((_m) =>
          plugin.id.startsWith(`${mappingKey}:`),
        );
      if (mapping) {
        expandPlugin(plugin, mapping);
      }
    } else {
      expandedPlugins.push(plugin);
    }
  });

  const validatePlugin: (plugin: (typeof plugins)[0]) => boolean = (plugin) => {
    if (Object.keys(categories).includes(plugin.id)) {
      return false;
    }
    const registeredPlugin = Plugins.find((p) => p.key === plugin.id);

    if (!registeredPlugin) {
      if (!plugin.id.startsWith('file://')) {
        logger.debug(`Plugin ${plugin.id} not registered, skipping validation`);
      }
    } else if (registeredPlugin.validate) {
      try {
        registeredPlugin.validate({
          language,
          modifiers: {
            ...(testGenerationInstructions ? { testGenerationInstructions } : {}),
            ...(plugin.config?.modifiers || {}),
          },
          ...resolvePluginConfig(plugin.config),
        });
      } catch (error) {
        logger.warn(`Validation failed for plugin ${plugin.id}: ${error}, skipping plugin.`);
        return false;
      }
    }

    return true;
  };

  // Validate all plugins upfront
  logger.debug('Validating plugins...');
  plugins = [...new Set(expandedPlugins)].filter(validatePlugin).sort();

  // Check API health before proceeding
  if (shouldGenerateRemote()) {
    const healthUrl = getRemoteHealthUrl();
    if (healthUrl) {
      logger.debug(`Checking Promptfoo API health at ${healthUrl}...`);
      const healthResult = await checkRemoteHealth(healthUrl);
      if (healthResult.status !== 'OK') {
        throw new Error(
          `Unable to proceed with test generation: ${healthResult.message}\n` +
            'Please check your API configuration or try again later.',
        );
      }
      logger.debug('API health check passed');
    }
  }

  // Start the progress bar
  let progressBar: cliProgress.SingleBar | null = null;
  const isWebUI = Boolean(cliState.webUI);

  const showProgressBar =
    !isWebUI &&
    getEnvString('LOG_LEVEL') !== 'debug' &&
    getLogLevel() !== 'debug' &&
    showProgressBarOverride !== false;
  if (showProgressBar) {
    progressBar = new cliProgress.SingleBar(
      {
        format: 'Generating | {bar} | {percentage}% | {value}/{total} | {task}',
        gracefulExit: true,
      },
      cliProgress.Presets.shades_classic,
    );
    // Use totalTests to include both plugin and strategy tests in progress tracking
    progressBar.start(totalTests, 0, { task: 'Initializing' });
  }

  // Replace progress bar updates with logger calls when in web UI
  if (showProgressBar) {
    progressBar?.update({ task: 'Extracting system purpose' });
  } else {
    logger.info('Extracting system purpose...');
  }
  const purpose = purposeOverride || (await extractSystemPurpose(redteamProvider, prompts));

  if (showProgressBar) {
    progressBar?.update({ task: 'Extracting entities' });
  } else {
    logger.info('Extracting entities...');
  }
  const entities: string[] = Array.isArray(entitiesOverride)
    ? entitiesOverride
    : await extractEntities(redteamProvider, prompts);

  logger.debug(`System purpose: ${purpose}`);

  const pluginResults: Record<string, { requested: number; generated: number }> = {};
  const testCases: TestCaseWithPlugin[] = [];
  await async.forEachLimit(plugins, maxConcurrency, async (plugin) => {
    // Check for abort signal before generating tests
    checkAbort();

    if (showProgressBar) {
      progressBar?.update({ task: plugin.id });
    } else {
      logger.info(`Generating tests for ${plugin.id}...`);
    }
    const { action } = Plugins.find((p) => p.key === plugin.id) || {};

    if (action) {
      logger.debug(`Generating tests for ${plugin.id}...`);

      // If plugin has its own language, use that; otherwise use global language
      const languageConfig = plugin.config?.language ?? language;
      const languages = Array.isArray(languageConfig)
        ? languageConfig
        : languageConfig
          ? [languageConfig]
          : [undefined];

      logger.debug(
        `[Language Processing] Plugin: ${plugin.id}, Languages: ${JSON.stringify(languages)}, NumTests per language: ${plugin.numTests}${plugin.config?.language ? ' (plugin override)' : ''}`,
      );

      // Generate tests for each language in parallel using Promise.allSettled
      const allPluginTests: TestCase[] = [];
      const resultsPerLanguage: Record<string, { requested: number; generated: number }> = {};

      const languagePromises = languages.map(async (lang) => {
        const pluginTests = await action({
          provider: redteamProvider,
          purpose,
          injectVar,
          n: plugin.numTests,
          delayMs: delay || 0,
          config: {
            ...resolvePluginConfig(plugin.config),
            ...(lang ? { language: lang } : {}),
            // Pass inputs to plugin for multi-variable test case generation
            ...(hasMultipleInputs ? { inputs } : {}),
            modifiers: {
              ...(testGenerationInstructions ? { testGenerationInstructions } : {}),
              ...(plugin.config?.modifiers || {}),
            },
          },
        });
        {
          const langKey = lang;

          if (Array.isArray(pluginTests) && pluginTests.length > 0) {
            // Add all metadata (language + plugin info) so strategies can access it
            const testsWithMetadata = pluginTests.map((test) =>
              addLanguageToPluginMetadata(test, lang, plugin, testGenerationInstructions),
            );

            return {
              lang: langKey,
              tests: testsWithMetadata,
              requested: plugin.numTests,
              generated: pluginTests.length,
            };
          }

          logger.warn(
            `[Language Processing] No tests generated for ${plugin.id} in language: ${lang || 'default'}`,
          );

          return {
            lang: langKey,
            tests: [],
            requested: plugin.numTests,
            generated: 0,
          };
        }
      });

      const languageResults = await Promise.allSettled(languagePromises);

      for (const result of languageResults) {
        if (result.status === 'fulfilled') {
          const { lang, tests, requested, generated } = result.value;

          allPluginTests.push(...tests);
          resultsPerLanguage[lang || 'default'] = { requested, generated };
        } else {
          // Handle rejected promise
          logger.warn(
            `[Language Processing] Error generating tests for ${plugin.id}: ${result.reason}`,
          );
        }
      }

      logger.debug(
        `[Language Processing] Total tests generated for ${plugin.id}: ${allPluginTests.length} (across ${languages.length} language(s))`,
      );

      if (!Array.isArray(allPluginTests) || allPluginTests.length === 0) {
        logger.warn(`Failed to generate tests for ${plugin.id}`);
      } else {
        // Metadata already added in promise resolution above (including pluginId)
        const testCasesWithMetadata = allPluginTests as TestCaseWithPlugin[];

        // Extract goal for this plugin's tests
        logger.debug(
          `Extracting goal for ${testCasesWithMetadata.length} tests from ${plugin.id}...`,
        );
        for (const testCase of testCasesWithMetadata) {
          // Get the prompt from the specific inject variable
          const promptVar = testCase.vars?.[injectVar];
          const prompt = Array.isArray(promptVar) ? promptVar[0] : String(promptVar);

          // For policy plugin, pass the policy text to improve intent extraction
          const policy = getPolicyText(testCase.metadata);
          const extractedGoal = await extractGoalFromPrompt(prompt, purpose, plugin.id, policy);

          (testCase.metadata as any).goal = extractedGoal;
        }

        // Add the results to main test cases array
        testCases.push(...testCasesWithMetadata);
      }

      if (showProgressBar) {
        progressBar?.increment(plugin.numTests * languages.length);
      } else {
        logger.info(`Generated ${allPluginTests.length} tests for ${plugin.id}`);
      }
      logger.debug(`Added ${allPluginTests.length} ${plugin.id} test cases`);

      // If multiple defined languages were used, create separate report entries for each language
      // Otherwise, use the aggregated result for the plugin
      const definedLanguages = languages.filter((lang) => lang !== undefined);

      // Get the display ID for this plugin (also serves as the unique key)
      const baseDisplayId = getPluginDisplayId(plugin);

      if (definedLanguages.length > 1) {
        // Multiple languages - create separate entries for each
        // Put language prefix at the beginning so it's visible even with truncation
        for (const [langKey, result] of Object.entries(resultsPerLanguage)) {
          // Use format like "(Hmong) Policy Name" so language is visible in truncated table
          const displayId = langKey === 'en' ? baseDisplayId : `(${langKey}) ${baseDisplayId}`;
          // For intent plugin, requested should equal generated (same as single-language behavior)
          const requested = plugin.id === 'intent' ? result.generated : result.requested;
          pluginResults[displayId] = { requested, generated: result.generated };
        }
      } else {
        // Single language or no language - use aggregated result
        const requested =
          plugin.id === 'intent' ? allPluginTests.length : plugin.numTests * languages.length;
        const generated = allPluginTests.length;
        pluginResults[baseDisplayId] = { requested, generated };
      }
    } else if (plugin.id.startsWith('file://')) {
      try {
        const customPlugin = new CustomPlugin(redteamProvider, purpose, injectVar, plugin.id);
        const customTests = await customPlugin.generateTests(plugin.numTests, delay);

        // Add metadata to each test case
        const testCasesWithMetadata = customTests.map((t) => ({
          ...t,
          metadata: {
            pluginId: plugin.id,
            pluginConfig: resolvePluginConfig(plugin.config),
            severity:
              plugin.severity || getPluginSeverity(plugin.id, resolvePluginConfig(plugin.config)),
            modifiers: {
              ...(testGenerationInstructions ? { testGenerationInstructions } : {}),
              ...(plugin.config?.modifiers || {}),
            },
            ...(t.metadata || {}),
          },
        }));

        // Extract goal for this plugin's tests
        logger.debug(
          `Extracting goal for ${testCasesWithMetadata.length} custom tests from ${plugin.id}...`,
        );
        for (const testCase of testCasesWithMetadata) {
          // Get the prompt from the specific inject variable
          const promptVar = testCase.vars?.[injectVar];
          const prompt = Array.isArray(promptVar) ? promptVar[0] : String(promptVar);

          // For policy plugin, pass the policy text to improve intent extraction
          const policy = getPolicyText(testCase.metadata);
          const extractedGoal = await extractGoalFromPrompt(prompt, purpose, plugin.id, policy);

          (testCase.metadata as any).goal = extractedGoal;
        }

        // Add the results to main test cases array
        testCases.push(...testCasesWithMetadata);

        logger.debug(`Added ${customTests.length} custom test cases from ${plugin.id}`);
        const displayId = getPluginDisplayId(plugin);
        pluginResults[displayId] = {
          requested: plugin.numTests,
          generated: customTests.length,
        };
      } catch (e) {
        logger.error(`Error generating tests for custom plugin ${plugin.id}: ${e}`);
        const displayId = getPluginDisplayId(plugin);
        pluginResults[displayId] = { requested: plugin.numTests, generated: 0 };
      }
    } else {
      logger.warn(`Plugin ${plugin.id} not registered, skipping`);
      const displayId = getPluginDisplayId(plugin);
      pluginResults[displayId] = { requested: plugin.numTests, generated: 0 };
      progressBar?.increment(plugin.numTests);
    }
  });

  // After generating plugin test cases but before applying strategies:
  const pluginTestCases = testCases;

  // Initialize strategy results
  const strategyResults: Record<string, { requested: number; generated: number }> = {};

  // Apply retry strategy first if it exists
  const retryStrategy = strategies.find((s) => s.id === 'retry');
  if (retryStrategy) {
    if (showProgressBar) {
      progressBar?.update({ task: 'Applying retry strategy' });
    }
    logger.debug('Applying retry strategy first');
    retryStrategy.config = {
      targetIds,
      ...retryStrategy.config,
    };
    const { testCases: retryTestCases, strategyResults: retryResults } = await applyStrategies(
      pluginTestCases,
      [retryStrategy],
      injectVar,
    );
    pluginTestCases.push(...retryTestCases);
    Object.assign(strategyResults, retryResults);
    // Update progress bar with retry strategy tests generated
    if (showProgressBar) {
      progressBar?.increment(retryTestCases.length);
    }
  }

  // Check for abort signal or apply non-basic strategies
  checkAbort();
  const nonBasicStrategies = strategies.filter((s) => !['basic', 'retry'].includes(s.id));
  if (showProgressBar && nonBasicStrategies.length > 0) {
    progressBar?.update({ task: 'Applying strategies' });
  }
  const { testCases: strategyTestCases, strategyResults: otherStrategyResults } =
    await applyStrategies(
      pluginTestCases,
      nonBasicStrategies,
      injectVar,
      excludeTargetOutputFromAgenticAttackGeneration,
    );

  Object.assign(strategyResults, otherStrategyResults);
  // Update progress bar with strategy tests generated
  if (showProgressBar && strategyTestCases.length > 0) {
    progressBar?.increment(strategyTestCases.length);
  }

  // Combine test cases based on basic strategy setting
  const finalTestCases = [...(includeBasicTests ? pluginTestCases : []), ...strategyTestCases];

  // Check for abort signal
  checkAbort();

  progressBar?.update({ task: 'Done.' });
  progressBar?.stop();
  if (progressBar) {
    // Newline after progress bar to avoid overlap
    logger.info('');
  }

  logger.info(generateReport(pluginResults, strategyResults));

  // Calculate failed plugins (those that generated 0 tests when they should have generated some)
  const failedPlugins: FailedPluginInfo[] = Object.entries(pluginResults)
    .filter(([_, { requested, generated }]) => requested > 0 && generated === 0)
    .map(([pluginId, { requested }]) => ({ pluginId, requested }));

  return { purpose, entities, testCases: finalTestCases, injectVar, failedPlugins };
}
