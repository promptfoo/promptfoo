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
 * Resolves the action function for a strategy (file-based or built-in).
 * Returns null if the strategy is not found.
 */
async function resolveStrategyAction(
  strategy: RedteamStrategyObject,
): Promise<((...args: any[]) => any) | null> {
  if (strategy.id.startsWith('file://')) {
    const loadedStrategy = await loadStrategy(strategy.id);
    return loadedStrategy.action;
  }

  // First try to find the exact strategy ID (e.g., jailbreak:composite)
  let builtinStrategy = Strategies.find((s) => s.id === strategy.id);

  // If not found, handle custom strategy variants (e.g., custom:aggressive)
  if (!builtinStrategy && strategy.id.includes(':')) {
    const baseStrategyId = strategy.id.split(':')[0];
    builtinStrategy = Strategies.find((s) => s.id === baseStrategyId);
  }

  if (!builtinStrategy) {
    logger.warn(`Strategy ${strategy.id} not registered, skipping`);
    return null;
  }

  return builtinStrategy.action;
}

/**
 * Filters and pre-limits test cases for a strategy based on plugin targeting and numTests.
 * Returns null if the strategy should be skipped entirely (numTests=0).
 */
function prepareTestCasesForStrategy(
  testCases: TestCaseWithPlugin[],
  strategy: RedteamStrategyObject,
): TestCaseWithPlugin[] | null {
  const targetPlugins = strategy.config?.plugins;
  const applicable = testCases.filter((t) => {
    if (!pluginMatchesStrategyTargets(t, strategy.id, targetPlugins)) {
      return false;
    }
    if (t.metadata?.retry === true) {
      logger.debug(
        `Skipping ${strategy.id} for retry test (plugin: ${t.metadata?.pluginId}) - retry tests are not transformed`,
      );
      return false;
    }
    return true;
  });

  const numTestsLimit = strategy.config?.numTests;
  const hasFiniteLimit =
    typeof numTestsLimit === 'number' && Number.isFinite(numTestsLimit) && numTestsLimit >= 0;

  if (hasFiniteLimit && numTestsLimit === 0) {
    logger.warn(`[Strategy] ${strategy.id}: numTests=0 configured, skipping strategy`);
    return null;
  }

  if (hasFiniteLimit && numTestsLimit > 0 && applicable.length > numTestsLimit) {
    logger.debug(
      `[Strategy] ${strategy.id}: Pre-limiting ${applicable.length} tests to numTests=${numTestsLimit}`,
    );
    return applicable.slice(0, numTestsLimit);
  }

  return applicable;
}

/**
 * Applies numTests post-cap to result test cases and logs a warning if capping occurs.
 */
function applyPostCap(resultTestCases: TestCase[], strategy: RedteamStrategyObject): TestCase[] {
  const numTestsLimit = strategy.config?.numTests;
  const hasFiniteLimit =
    typeof numTestsLimit === 'number' && Number.isFinite(numTestsLimit) && numTestsLimit > 0;

  if (hasFiniteLimit && resultTestCases.length > numTestsLimit) {
    logger.warn(
      `[Strategy] ${strategy.id}: Post-cap safety net applied (${resultTestCases.length} -> ${numTestsLimit}). Strategy generated more tests than input.`,
    );
    return resultTestCases.slice(0, numTestsLimit);
  }

  return resultTestCases;
}

/**
 * Transforms a single strategy test case result: re-extracts JSON vars and merges metadata.
 */
function transformStrategyTestCase(
  t: TestCase,
  strategy: RedteamStrategyObject,
  injectVar: string,
): TestCaseWithPlugin {
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
}

/**
 * Computes the display ID for a strategy (handles layer strategy labeling).
 */
function getStrategyDisplayId(strategy: RedteamStrategyObject): string {
  if (strategy.id === 'layer' && Array.isArray(strategy.config?.steps)) {
    const steps = (strategy.config!.steps as any[])
      .map((st) => (typeof st === 'string' ? st : st.id))
      .join('→');
    return `layer(${steps})`;
  }
  return strategy.id;
}

/**
 * Applies a numTests cap to a requested count, with defensive checks.
 */
function applyNumTestsCap(calculatedRequested: number, strategy: RedteamStrategyObject): number {
  const numTestsCap = strategy.config?.numTests;
  if (typeof numTestsCap === 'number' && Number.isFinite(numTestsCap) && numTestsCap >= 0) {
    return Math.min(calculatedRequested, numTestsCap);
  }
  return calculatedRequested;
}

/**
 * Gets the fan-out multiplier n for a strategy.
 */
function getStrategyN(strategy: RedteamStrategyObject): number {
  if (typeof strategy.config?.n === 'number') {
    return strategy.config.n;
  }
  if (isFanoutStrategy(strategy.id)) {
    return getDefaultNFanout(strategy.id);
  }
  return 1;
}

/**
 * Computes and writes strategy results into the strategyResults map for multilingual results.
 */
function recordMultilingualStrategyResults(
  strategyResults: Record<string, { requested: number; generated: number }>,
  strategy: RedteamStrategyObject,
  displayId: string,
  languagesInResults: Set<string>,
  resultTestCases: TestCase[],
  applicableTestCases: TestCaseWithPlugin[],
): void {
  const resultsByLanguage: Record<string, { requested: number; generated: number }> = {};
  const n = getStrategyN(strategy);

  for (const lang of languagesInResults) {
    const testsForLang = resultTestCases.filter((t) => getLanguageForTestCase(t) === lang);
    const applicableForLang = applicableTestCases.filter((t) => getLanguageForTestCase(t) === lang);
    resultsByLanguage[lang] = {
      requested: applyNumTestsCap(applicableForLang.length * n, strategy),
      generated: testsForLang.length,
    };
  }

  for (const [lang, result] of Object.entries(resultsByLanguage)) {
    const strategyDisplayId = lang === 'en' ? displayId : `${displayId} (${lang})`;
    strategyResults[strategyDisplayId] = result;
  }
}

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

    const strategyAction = await resolveStrategyAction(strategy);
    if (!strategyAction) {
      continue;
    }

    const testCasesToProcess = prepareTestCasesForStrategy(testCases, strategy);
    if (testCasesToProcess === null) {
      continue;
    }

    // applicableTestCases is needed for result counts; we re-derive it without the numTests slice
    const targetPlugins = strategy.config?.plugins;
    const applicableTestCases = testCases.filter(
      (t) =>
        pluginMatchesStrategyTargets(t, strategy.id, targetPlugins) && t.metadata?.retry !== true,
    );

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

    // Filter out null/undefined then apply post-cap
    const filtered = strategyTestCases.filter(
      (t): t is NonNullable<typeof t> => t !== null && t !== undefined,
    );
    const resultTestCases = applyPostCap(filtered, strategy);

    newTestCases.push(
      ...resultTestCases.map((t) => transformStrategyTestCase(t, strategy, injectVar)),
    );

    const displayId = getStrategyDisplayId(strategy);

    // Check if strategy generated tests across multiple languages
    const languagesInResults = new Set(
      strategyTestCases
        .map((t) => getLanguageForTestCase(t))
        .filter((lang): lang is string => lang !== undefined),
    );

    if (languagesInResults.size > 1) {
      recordMultilingualStrategyResults(
        strategyResults,
        strategy,
        displayId,
        languagesInResults,
        resultTestCases,
        applicableTestCases,
      );
    } else if (strategy.id === 'layer') {
      // Layer strategy: requested count is same as applicable test cases
      strategyResults[displayId] = {
        requested: applyNumTestsCap(applicableTestCases.length, strategy),
        generated: resultTestCases.length,
      };
    } else {
      const n = getStrategyN(strategy);
      strategyResults[displayId] = {
        requested: applyNumTestsCap(applicableTestCases.length * n, strategy),
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
 * Returns a deduplication key for a strategy.
 */
function getStrategyDeduplicationKey(s: RedteamStrategyObject): string {
  if (s.id === 'layer' && s.config) {
    const config = s.config as Record<string, unknown>;
    if (typeof config.label === 'string' && config.label.trim()) {
      return `layer/${config.label}`;
    }
    if (Array.isArray(config.steps)) {
      const steps = (config.steps as Array<string | { id?: string }>).map((st) =>
        typeof st === 'string' ? st : (st?.id ?? 'unknown'),
      );
      return `layer:${steps.join('->')}`;
    }
  }
  return s.id;
}

/**
 * Expands strategy collections and deduplicates strategies.
 */
function expandAndDeduplicateStrategies(
  strategies: RedteamStrategyObject[],
): RedteamStrategyObject[] {
  const expandedStrategies: RedteamStrategyObject[] = [];
  for (const strategy of strategies) {
    if (isStrategyCollection(strategy.id)) {
      const aliasedStrategies = STRATEGY_COLLECTION_MAPPINGS[strategy.id];
      if (aliasedStrategies) {
        for (const strategyId of aliasedStrategies) {
          expandedStrategies.push({ ...strategy, id: strategyId });
        }
      } else {
        logger.warn(`Strategy collection ${strategy.id} has no mappings, skipping`);
      }
    } else {
      expandedStrategies.push(strategy);
    }
  }

  const seen = new Set<string>();
  return expandedStrategies.filter((strategy) => {
    const key = getStrategyDeduplicationKey(strategy);
    if (seen.has(key)) {
      logger.debug(`[Synthesize] Skipping duplicate strategy: ${key}`);
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Builds a concise policy config summary for the plugin display string.
 */
function buildPolicyConfigSummary(pluginId: string, config: Record<string, any>): string {
  if (pluginId !== 'policy') {
    return ' (custom config)';
  }
  const policy = config?.policy as Policy;
  if (isValidPolicyObject(policy)) {
    const policyText = policy.text!.trim().replace(/\n+/g, ' ');
    const truncated = policyText.length > 70 ? policyText.slice(0, 70) + '...' : policyText;
    let summary = policy.name ? ` ${policy.name}:` : '';
    summary += ` "${truncated}"`;
    return summary;
  }
  const policyText = (policy as unknown as string).trim().replace(/\n+/g, ' ');
  const truncated = policyText.length > 70 ? policyText.slice(0, 70) + '...' : policyText;
  return truncated;
}

/**
 * Logs the plugins and strategies that will be used for synthesis.
 */
function logSynthesisHeader(
  plugins: SynthesizeOptions['plugins'],
  strategies: RedteamStrategyObject[],
  language: SynthesizeOptions['language'],
  totalPluginTests: number,
  totalTests: number,
  effectiveStrategyCount: number,
  maxConcurrency: number,
  delay: number | undefined,
  prompts: string[],
): void {
  const pluginLines = plugins
    .map((p) => {
      const pluginLanguageConfig = p.config?.language ?? language;
      const pluginLanguageCount = Array.isArray(pluginLanguageConfig)
        ? pluginLanguageConfig.length
        : 1;
      const actualTestCount = (p.numTests || 0) * pluginLanguageCount;
      let configSummary = '';
      if (p.config) {
        configSummary = buildPolicyConfigSummary(p.id, p.config);
        logger.debug('Plugin config', { pluginId: p.id, config: p.config });
      }
      return `${p.id} (${formatTestCount(actualTestCount, false)})${configSummary}`;
    })
    .sort()
    .join('\n');

  logger.info(
    `Synthesizing test cases for ${prompts.length} ${
      prompts.length === 1 ? 'prompt' : 'prompts'
    }...\nUsing plugins:\n\n${chalk.yellow(pluginLines)}\n`,
  );

  if (strategies.length > 0) {
    const strategyLines = strategies
      .filter((s) => !['basic', 'retry'].includes(s.id))
      .map((s) => {
        const n = getStrategyN(s);
        let testCount = totalPluginTests * n;
        const numTestsCap = s.config?.numTests;
        if (typeof numTestsCap === 'number' && Number.isFinite(numTestsCap) && numTestsCap >= 0) {
          testCount = Math.min(testCount, numTestsCap);
        }
        return `${s.id} (${formatTestCount(testCount, true)})`;
      })
      .sort()
      .join('\n');

    logger.info(`Using strategies:\n\n${chalk.yellow(strategyLines)}\n`);
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
}

/**
 * Resolves the injectVar from prompts when not explicitly set (single-input mode only).
 */
function resolveInjectVarFromPrompts(prompts: string[]): string {
  const parsedVars = extractVariablesFromTemplates(prompts);
  if (parsedVars.length > 1) {
    logger.warn(
      `\nMultiple variables found in prompts: ${parsedVars.join(', ')}. Using the last one "${parsedVars[parsedVars.length - 1]}". Override this selection with --injectVar`,
    );
  } else if (parsedVars.length === 0) {
    logger.warn('No variables found in prompts. Using "query" as the inject variable.');
  }
  const resolved = parsedVars[parsedVars.length - 1] || 'query';
  invariant(typeof resolved === 'string', `Inject var must be a string, got ${resolved}`);
  return resolved;
}

/**
 * Validates a single plugin, returning false if it should be skipped.
 */
function validatePluginEntry(
  plugin: SynthesizeOptions['plugins'][0],
  language: SynthesizeOptions['language'],
  testGenerationInstructions: string | undefined,
): boolean {
  if (Object.keys(categories).includes(plugin.id)) {
    return false;
  }
  const registeredPlugin = Plugins.find((p) => p.key === plugin.id);
  if (!registeredPlugin) {
    if (!plugin.id.startsWith('file://')) {
      logger.debug(`Plugin ${plugin.id} not registered, skipping validation`);
    }
    return true;
  }
  if (!registeredPlugin.validate) {
    return true;
  }
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
  return true;
}

/**
 * Expands category and aliased plugins, returning the deduplicated/validated list.
 */
function expandAndValidatePlugins(
  plugins: SynthesizeOptions['plugins'],
  strategies: RedteamStrategyObject[],
  language: SynthesizeOptions['language'],
  testGenerationInstructions: string | undefined,
): SynthesizeOptions['plugins'] {
  // Expand category plugins first
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

  for (const plugin of plugins) {
    const isDirectPlugin = Plugins.some((p) => p.key === plugin.id);
    if (isDirectPlugin) {
      expandedPlugins.push(plugin);
      continue;
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
        continue;
      }
    }

    expandedPlugins.push(plugin);
  }

  logger.debug('Validating plugins...');
  return [...new Set(expandedPlugins)]
    .filter((plugin) => validatePluginEntry(plugin, language, testGenerationInstructions))
    .sort();
}

/**
 * Extracts the goal for each test case by calling extractGoalFromPrompt.
 */
async function enrichTestCasesWithGoals(
  testCasesWithMetadata: TestCaseWithPlugin[],
  purpose: string,
  pluginId: string,
  injectVar: string,
): Promise<void> {
  logger.debug(`Extracting goal for ${testCasesWithMetadata.length} tests from ${pluginId}...`);
  for (const testCase of testCasesWithMetadata) {
    const promptVar = testCase.vars?.[injectVar];
    const prompt = Array.isArray(promptVar) ? promptVar[0] : String(promptVar);
    const policy = getPolicyText(testCase.metadata);
    const extractedGoal = await extractGoalFromPrompt(prompt, purpose, pluginId, policy);
    (testCase.metadata as any).goal = extractedGoal;
  }
}

interface PluginGenerateContext {
  redteamProvider: any;
  purpose: string;
  injectVar: string;
  delay: number | undefined;
  hasMultipleInputs: boolean;
  inputs: SynthesizeOptions['inputs'];
  language: SynthesizeOptions['language'];
  testGenerationInstructions: string | undefined;
}

/**
 * Generates tests for a single language for a registered plugin.
 */
async function generatePluginTestsForLanguage(
  plugin: SynthesizeOptions['plugins'][0],
  lang: string | undefined,
  action: (...args: any[]) => any,
  ctx: PluginGenerateContext,
): Promise<{
  lang: string | undefined;
  tests: TestCaseWithPlugin[];
  requested: number | undefined;
  generated: number;
}> {
  const pluginTests = await action({
    provider: ctx.redteamProvider,
    purpose: ctx.purpose,
    injectVar: ctx.injectVar,
    n: plugin.numTests,
    delayMs: ctx.delay || 0,
    config: {
      ...resolvePluginConfig(plugin.config),
      ...(lang ? { language: lang } : {}),
      ...(ctx.hasMultipleInputs ? { inputs: ctx.inputs } : {}),
      modifiers: {
        ...(ctx.testGenerationInstructions
          ? { testGenerationInstructions: ctx.testGenerationInstructions }
          : {}),
        ...(plugin.config?.modifiers || {}),
      },
    },
  });

  if (Array.isArray(pluginTests) && pluginTests.length > 0) {
    const testsWithMetadata = pluginTests.map((test) =>
      addLanguageToPluginMetadata(test, lang, plugin, ctx.testGenerationInstructions),
    );
    return {
      lang,
      tests: testsWithMetadata,
      requested: plugin.numTests,
      generated: pluginTests.length,
    };
  }

  logger.warn(
    `[Language Processing] No tests generated for ${plugin.id} in language: ${lang || 'default'}`,
  );
  return { lang, tests: [], requested: plugin.numTests, generated: 0 };
}

/**
 * Processes a registered plugin: generates tests across all languages and records results.
 */
async function processRegisteredPlugin(
  plugin: SynthesizeOptions['plugins'][0],
  action: (...args: any[]) => any,
  ctx: PluginGenerateContext,
  testCases: TestCaseWithPlugin[],
  pluginResults: Record<string, { requested: number; generated: number }>,
  progressBar: cliProgress.SingleBar | null,
  showProgressBar: boolean,
): Promise<void> {
  const languageConfig = plugin.config?.language ?? ctx.language;
  const languages: (string | undefined)[] = Array.isArray(languageConfig)
    ? languageConfig
    : languageConfig
      ? [languageConfig]
      : [undefined];

  logger.debug(
    `[Language Processing] Plugin: ${plugin.id}, Languages: ${JSON.stringify(languages)}, NumTests per language: ${plugin.numTests}${plugin.config?.language ? ' (plugin override)' : ''}`,
  );

  const allPluginTests: TestCase[] = [];
  const resultsPerLanguage: Record<string, { requested: number | undefined; generated: number }> =
    {};

  const languageResults = await Promise.allSettled(
    languages.map((lang) => generatePluginTestsForLanguage(plugin, lang, action, ctx)),
  );

  for (const result of languageResults) {
    if (result.status === 'fulfilled') {
      const { lang, tests, requested, generated } = result.value;
      allPluginTests.push(...tests);
      resultsPerLanguage[lang ?? 'default'] = { requested, generated };
    } else {
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
    const testCasesWithMetadata = allPluginTests as TestCaseWithPlugin[];
    await enrichTestCasesWithGoals(testCasesWithMetadata, ctx.purpose, plugin.id, ctx.injectVar);
    testCases.push(...testCasesWithMetadata);
  }

  if (showProgressBar) {
    progressBar?.increment(plugin.numTests * languages.length);
  } else {
    logger.info(`Generated ${allPluginTests.length} tests for ${plugin.id}`);
  }
  logger.debug(`Added ${allPluginTests.length} ${plugin.id} test cases`);

  const definedLanguages = languages.filter((lang) => lang !== undefined);
  const baseDisplayId = getPluginDisplayId(plugin);

  if (definedLanguages.length > 1) {
    for (const [langKey, result] of Object.entries(resultsPerLanguage)) {
      const displayId = langKey === 'en' ? baseDisplayId : `(${langKey}) ${baseDisplayId}`;
      const requested = plugin.id === 'intent' ? result.generated : (result.requested ?? 0);
      pluginResults[displayId] = { requested, generated: result.generated };
    }
  } else {
    const requested =
      plugin.id === 'intent' ? allPluginTests.length : (plugin.numTests ?? 0) * languages.length;
    pluginResults[baseDisplayId] = { requested, generated: allPluginTests.length };
  }
}

/**
 * Processes a custom file:// plugin: generates tests and records results.
 */
async function processCustomPlugin(
  plugin: SynthesizeOptions['plugins'][0],
  ctx: PluginGenerateContext,
  testCases: TestCaseWithPlugin[],
  pluginResults: Record<string, { requested: number; generated: number }>,
): Promise<void> {
  const displayId = getPluginDisplayId(plugin);
  try {
    const customPlugin = new CustomPlugin(
      ctx.redteamProvider,
      ctx.purpose,
      ctx.injectVar,
      plugin.id,
    );
    const customTests = await customPlugin.generateTests(plugin.numTests, ctx.delay);

    const testCasesWithMetadata = customTests.map((t) => ({
      ...t,
      metadata: {
        pluginId: plugin.id,
        pluginConfig: resolvePluginConfig(plugin.config),
        severity:
          plugin.severity || getPluginSeverity(plugin.id, resolvePluginConfig(plugin.config)),
        modifiers: {
          ...(ctx.testGenerationInstructions
            ? { testGenerationInstructions: ctx.testGenerationInstructions }
            : {}),
          ...(plugin.config?.modifiers || {}),
        },
        ...(t.metadata || {}),
      },
    }));

    await enrichTestCasesWithGoals(
      testCasesWithMetadata as TestCaseWithPlugin[],
      ctx.purpose,
      plugin.id,
      ctx.injectVar,
    );
    testCases.push(...testCasesWithMetadata);

    logger.debug(`Added ${customTests.length} custom test cases from ${plugin.id}`);
    pluginResults[displayId] = { requested: plugin.numTests ?? 0, generated: customTests.length };
  } catch (e) {
    logger.error(`Error generating tests for custom plugin ${plugin.id}: ${e}`);
    pluginResults[displayId] = { requested: plugin.numTests ?? 0, generated: 0 };
  }
}

/**
 * Handles multi-input mode setup: sets injectVar and filters incompatible plugins.
 * Returns the updated injectVar and filtered plugins.
 */
function applyMultiInputMode(
  inputs: SynthesizeOptions['inputs'],
  plugins: SynthesizeOptions['plugins'],
  injectVar: string | undefined,
): { injectVar: string; plugins: SynthesizeOptions['plugins'] } {
  const hasMultipleInputs = inputs && Object.keys(inputs).length > 0;
  if (!hasMultipleInputs) {
    return { injectVar: injectVar as string, plugins };
  }
  const inputKeys = Object.keys(inputs);
  logger.info(`Using multi-input mode with ${inputKeys.length} variables: ${inputKeys.join(', ')}`);

  const multiInputExcluded = [...DATASET_EXEMPT_PLUGINS, ...MULTI_INPUT_EXCLUDED_PLUGINS];
  const removedPlugins = plugins.filter((p) => multiInputExcluded.includes(p.id as any));
  const filteredPlugins = plugins.filter((p) => !multiInputExcluded.includes(p.id as any));
  if (removedPlugins.length > 0) {
    logger.info(
      `Skipping ${removedPlugins.length} plugin${removedPlugins.length > 1 ? 's' : ''} in multi-input mode: ${removedPlugins.map((p) => p.id).join(', ')}`,
    );
  }
  return { injectVar: MULTI_INPUT_VAR, plugins: filteredPlugins };
}

/**
 * Applies the retry strategy to plugin test cases and updates strategyResults.
 */
async function applyRetryStrategy(
  strategies: RedteamStrategyObject[],
  pluginTestCases: TestCaseWithPlugin[],
  strategyResults: Record<string, { requested: number; generated: number }>,
  injectVar: string,
  targetIds: string[] | undefined,
  progressBar: cliProgress.SingleBar | null,
  showProgressBar: boolean,
): Promise<void> {
  const retryStrategy = strategies.find((s) => s.id === 'retry');
  if (!retryStrategy) {
    return;
  }
  if (showProgressBar) {
    progressBar?.update({ task: 'Applying retry strategy' });
  }
  logger.debug('Applying retry strategy first');
  retryStrategy.config = { targetIds, ...retryStrategy.config };
  const { testCases: retryTestCases, strategyResults: retryResults } = await applyStrategies(
    pluginTestCases,
    [retryStrategy],
    injectVar,
  );
  pluginTestCases.push(...retryTestCases);
  Object.assign(strategyResults, retryResults);
  if (showProgressBar) {
    progressBar?.increment(retryTestCases.length);
  }
}

/**
 * Checks the remote API health if remote generation is enabled.
 */
async function checkApiHealthIfNeeded(): Promise<void> {
  if (!shouldGenerateRemote()) {
    return;
  }
  const healthUrl = getRemoteHealthUrl();
  if (!healthUrl) {
    return;
  }
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
  const checkAbort = () => {
    if (abortSignal?.aborted) {
      throw new Error('Operation cancelled');
    }
  };

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

  // Expand strategy collections and deduplicate
  strategies = expandAndDeduplicateStrategies(strategies);

  await validateStrategies(strategies);
  await validateSharpDependency(strategies, plugins);

  const redteamProvider = await redteamProviderManager.getProvider({ provider });

  const { effectiveStrategyCount, includeBasicTests, totalPluginTests, totalTests } =
    calculateTotalTests(plugins, strategies, language);

  logSynthesisHeader(
    plugins,
    strategies,
    language,
    totalPluginTests,
    totalTests,
    effectiveStrategyCount,
    maxConcurrency,
    delay,
    prompts,
  );

  // Handle multi-input mode setup
  ({ injectVar, plugins } = applyMultiInputMode(inputs, plugins, injectVar));

  // Determine injectVar if not explicitly set (only applies to single-input mode)
  if (typeof injectVar !== 'string') {
    injectVar = resolveInjectVarFromPrompts(prompts);
  }

  const hasMultipleInputs = injectVar === MULTI_INPUT_VAR;

  // Expand and validate plugins (mutates strategies for aliased plugin mappings)
  plugins = expandAndValidatePlugins(plugins, strategies, language, testGenerationInstructions);

  await checkApiHealthIfNeeded();

  // Set up progress bar
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
    progressBar.start(totalTests, 0, { task: 'Initializing' });
  }

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

  const pluginCtx: PluginGenerateContext = {
    redteamProvider,
    purpose,
    injectVar,
    delay,
    hasMultipleInputs: Boolean(hasMultipleInputs),
    inputs,
    language,
    testGenerationInstructions,
  };

  const pluginResults: Record<string, { requested: number; generated: number }> = {};
  const testCases: TestCaseWithPlugin[] = [];
  await async.forEachLimit(plugins, maxConcurrency, async (plugin) => {
    checkAbort();

    if (showProgressBar) {
      progressBar?.update({ task: plugin.id });
    } else {
      logger.info(`Generating tests for ${plugin.id}...`);
    }

    const { action } = Plugins.find((p) => p.key === plugin.id) || {};

    if (action) {
      logger.debug(`Generating tests for ${plugin.id}...`);
      await processRegisteredPlugin(
        plugin,
        action,
        pluginCtx,
        testCases,
        pluginResults,
        progressBar,
        showProgressBar,
      );
    } else if (plugin.id.startsWith('file://')) {
      await processCustomPlugin(plugin, pluginCtx, testCases, pluginResults);
    } else {
      logger.warn(`Plugin ${plugin.id} not registered, skipping`);
      const displayId = getPluginDisplayId(plugin);
      pluginResults[displayId] = { requested: plugin.numTests ?? 0, generated: 0 };
      progressBar?.increment(plugin.numTests);
    }
  });

  const pluginTestCases = testCases;
  const strategyResults: Record<string, { requested: number; generated: number }> = {};

  await applyRetryStrategy(
    strategies,
    pluginTestCases,
    strategyResults,
    injectVar,
    targetIds,
    progressBar,
    showProgressBar,
  );

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
  if (showProgressBar && strategyTestCases.length > 0) {
    progressBar?.increment(strategyTestCases.length);
  }

  const finalTestCases = [...(includeBasicTests ? pluginTestCases : []), ...strategyTestCases];

  checkAbort();

  progressBar?.update({ task: 'Done.' });
  progressBar?.stop();
  if (progressBar) {
    logger.info('');
  }

  logger.info(generateReport(pluginResults, strategyResults));

  const failedPlugins: FailedPluginInfo[] = Object.entries(pluginResults)
    .filter(([_, { requested, generated }]) => requested > 0 && generated === 0)
    .map(([pluginId, { requested }]) => ({ pluginId, requested }));

  return { purpose, entities, testCases: finalTestCases, injectVar, failedPlugins };
}
