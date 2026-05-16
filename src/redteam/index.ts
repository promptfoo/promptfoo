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
import { maybeLoadFromExternalFile } from '../util/file';
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
  TEEN_SAFETY_PLUGINS,
  TELECOM_PLUGINS,
} from './constants';
import { CODING_AGENT_CORE_PLUGINS, CODING_AGENT_PLUGINS } from './constants/codingAgents';
import { extractEntities } from './extraction/entities';
import { extractSystemPurpose } from './extraction/purpose';
import { CustomPlugin } from './plugins/custom';
import { Plugins } from './plugins/index';
import { isValidPolicyObject, makeInlinePolicyIdSync } from './plugins/policy/utils';
import { redteamProviderManager } from './providers/shared';
import { getRemoteHealthUrl, shouldGenerateRemote } from './remoteGeneration';
import {
  getGeneratedPromptOverLimit,
  getMaxCharsPerMessageModifierValue,
  MAX_CHARS_PER_MESSAGE_MODIFIER_KEY,
} from './shared/promptLength';
import { validateSharpDependency } from './sharpAvailability';
import { loadStrategy, Strategies, validateStrategies } from './strategies/index';
import { pluginMatchesStrategyTargets } from './strategies/util';
import {
  extractGoalFromPrompt,
  extractMaterializedVariablesFromJsonWithMetadata,
  getShortPluginId,
} from './util';

import type { ApiProvider, TestCase, TestCaseWithPlugin } from '../types/index';
import type { Inputs } from '../types/shared';
import type {
  FailedPluginInfo,
  Policy,
  RedteamPluginObject,
  RedteamStrategyObject,
  SynthesizeOptions,
} from './types';

const MATERIALIZED_MULTI_INPUT_PROMPT_METADATA_KEY = '__promptfooMaterializedMultiInputPrompt';

function getMaterializedMultiInputPromptSnapshot(
  metadata: TestCase['metadata'] | undefined,
): string | undefined {
  const snapshot = metadata?.[MATERIALIZED_MULTI_INPUT_PROMPT_METADATA_KEY];
  return typeof snapshot === 'string' ? snapshot : undefined;
}

function getMaterializedMultiInputPromptMetadata(
  vars: TestCase['vars'] | undefined,
): Record<string, string> | undefined {
  const prompt = vars?.[MULTI_INPUT_VAR];
  return typeof prompt === 'string'
    ? { [MATERIALIZED_MULTI_INPUT_PROMPT_METADATA_KEY]: prompt }
    : undefined;
}

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

async function rematerializeStrategyInputVars(
  testCase: TestCase,
  injectVar: string,
  provider: ApiProvider,
  purpose: string,
  materializationIndex: number,
): Promise<{
  inputMaterialization: Record<string, unknown> | undefined;
  vars: TestCase['vars'];
}> {
  const inputs = testCase.metadata?.pluginConfig?.inputs as Inputs | undefined;
  const inputMaterialization = testCase.metadata?.inputMaterialization as
    | Record<string, unknown>
    | undefined;
  const materializedPromptSnapshot = getMaterializedMultiInputPromptSnapshot(testCase.metadata);
  const currentInjectVar = testCase.vars?.[injectVar];

  if (!inputs || Object.keys(inputs).length === 0 || !currentInjectVar) {
    return {
      inputMaterialization,
      vars: testCase.vars,
    };
  }

  const promptChangedSinceMaterialization =
    typeof currentInjectVar === 'string' &&
    typeof materializedPromptSnapshot === 'string' &&
    currentInjectVar !== materializedPromptSnapshot;
  const alreadyMaterialized =
    Boolean(inputMaterialization) &&
    Object.keys(inputs).every((key) =>
      Object.prototype.hasOwnProperty.call(testCase.vars ?? {}, key),
    );
  if (alreadyMaterialized && !promptChangedSinceMaterialization) {
    return {
      inputMaterialization,
      vars: testCase.vars,
    };
  }

  try {
    const parsed = JSON.parse(String(currentInjectVar));
    const materializedVars = await extractMaterializedVariablesFromJsonWithMetadata(
      parsed,
      inputs,
      {
        materializationIndex,
        pluginId: String(testCase.metadata?.pluginId || 'unknown-plugin'),
        provider,
        purpose,
      },
    );

    return {
      inputMaterialization: materializedVars.metadata
        ? {
            ...inputMaterialization,
            ...materializedVars.metadata,
          }
        : inputMaterialization,
      vars: {
        ...testCase.vars,
        ...materializedVars.vars,
      },
    };
  } catch {
    return {
      inputMaterialization,
      vars: testCase.vars,
    };
  }
}

export const MAX_MAX_CONCURRENCY = 20;

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

function resolvePluginConfigWithMaxChars(
  config: Record<string, any> | undefined,
  maxCharsPerMessage?: number,
): Record<string, any> {
  return {
    ...resolvePluginConfig(config),
    ...(maxCharsPerMessage ? { maxCharsPerMessage } : {}),
  };
}

function buildRedteamModifiers({
  maxCharsPerMessage,
  pluginConfig,
  testGenerationInstructions,
}: {
  maxCharsPerMessage?: number;
  pluginConfig?: Record<string, any>;
  testGenerationInstructions?: string;
}): Record<string, string> {
  const modifiers: Record<string, string> = {
    ...(testGenerationInstructions ? { testGenerationInstructions } : {}),
    ...((pluginConfig?.modifiers as Record<string, string> | undefined) ?? {}),
  };
  const maxCharsPerMessageModifier = getMaxCharsPerMessageModifierValue(
    maxCharsPerMessage ?? pluginConfig?.maxCharsPerMessage,
  );
  if (maxCharsPerMessageModifier) {
    modifiers[MAX_CHARS_PER_MESSAGE_MODIFIER_KEY] = maxCharsPerMessageModifier;
  }
  return modifiers;
}

const categories = {
  foundation: FOUNDATION_PLUGINS,
  harmful: Object.keys(HARM_PLUGINS),
  'coding-agent:core': CODING_AGENT_CORE_PLUGINS,
  'coding-agent:all': CODING_AGENT_PLUGINS,
  bias: BIAS_PLUGINS,
  pii: PII_PLUGINS,
  medical: MEDICAL_PLUGINS,
  pharmacy: PHARMACY_PLUGINS,
  insurance: INSURANCE_PLUGINS,
  financial: FINANCIAL_PLUGINS,
  telecom: TELECOM_PLUGINS,
  'teen-safety': TEEN_SAFETY_PLUGINS,
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

function getPluginLanguageCount(
  plugin: SynthesizeOptions['plugins'][number],
  language?: string | string[],
): number {
  const pluginLanguageConfig = plugin.config?.language ?? language;
  return Array.isArray(pluginLanguageConfig) ? pluginLanguageConfig.length : 1;
}

// Cache resolved intent counts per plugin instance. Resolving `file://`
// intent lists requires disk I/O + parsing; `getExpectedPluginTestCount` is
// invoked many times per run (totals, logging, progress, reporting), so we
// memoize on the plugin object identity to avoid redundant reads.
const intentTestCountCache = new WeakMap<object, number>();

function getIntentTestCount(plugin: SynthesizeOptions['plugins'][number]): number | undefined {
  if (plugin.id !== 'intent') {
    return undefined;
  }

  const cached = intentTestCountCache.get(plugin as object);
  if (cached !== undefined) {
    return cached;
  }

  const intent = plugin.config?.intent;
  if (!intent) {
    intentTestCountCache.set(plugin as object, 0);
    return 0;
  }

  // Resolve `file://` references so pre-generation totals match what IntentPlugin
  // will actually emit at runtime. Falls back to the literal value if the file
  // can't be read yet (e.g. the path is unresolved or doesn't exist locally).
  let resolved: unknown;
  try {
    resolved = maybeLoadFromExternalFile(intent as string | object);
  } catch (err) {
    logger.debug(
      `[redteam] Failed to resolve intent file for pre-generation count; treating as a single intent. Run-time count from IntentPlugin will be authoritative. Error: ${err instanceof Error ? err.message : String(err)}`,
    );
    resolved = intent;
  }

  const count = Array.isArray(resolved) ? resolved.length : 1;
  intentTestCountCache.set(plugin as object, count);
  return count;
}

function getExpectedPluginTestCount(
  plugin: SynthesizeOptions['plugins'][number],
  language?: string | string[],
): number {
  const languageCount = getPluginLanguageCount(plugin, language);
  return (getIntentTestCount(plugin) ?? plugin.numTests ?? 0) * languageCount;
}

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

function filterOversizedTestCases<T extends TestCase>(
  testCases: T[],
  injectVar: string,
  sourceLabel: string,
  maxCharsPerMessage?: number,
): T[] {
  return testCases.filter((testCase) => {
    const testCaseMaxCharsPerMessage =
      maxCharsPerMessage ??
      (testCase.metadata?.strategyConfig as { maxCharsPerMessage?: number } | undefined)
        ?.maxCharsPerMessage ??
      (testCase.metadata?.pluginConfig as { maxCharsPerMessage?: number } | undefined)
        ?.maxCharsPerMessage;
    const violation = getGeneratedPromptOverLimit(
      String(testCase.vars?.[injectVar] ?? ''),
      testCaseMaxCharsPerMessage,
    );
    if (!violation) {
      return true;
    }

    logger.warn(
      `[${sourceLabel}] Dropping generated test case that exceeds maxCharsPerMessage=${violation.limit} (${violation.length} chars)`,
    );
    return false;
  });
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
  maxCharsPerMessage?: number,
  testGenerationInstructions?: string,
): TestCase {
  const existingLanguage = getLanguageForTestCase(test);
  const languageToAdd = lang && !existingLanguage ? { language: lang } : {};
  const includePluginConfig = !(
    test.metadata &&
    Object.hasOwn(test.metadata, 'pluginConfig') &&
    test.metadata.pluginConfig === undefined
  );

  // Use modifiers from the test's pluginConfig first (which may have been computed by appendModifiers),
  // then fall back to the original plugin.config?.modifiers
  const pluginModifiers = buildRedteamModifiers({
    maxCharsPerMessage,
    pluginConfig:
      (test.metadata?.pluginConfig as Record<string, any> | undefined) ||
      plugin.config ||
      undefined,
    testGenerationInstructions,
  });

  return {
    ...test,
    metadata: {
      ...test.metadata,
      pluginId: plugin.id,
      ...(includePluginConfig && {
        pluginConfig: {
          ...resolvePluginConfigWithMaxChars(plugin.config, maxCharsPerMessage),
          ...((test.metadata?.pluginConfig as Record<string, any> | undefined) ?? {}),
        },
      }),
      severity: plugin.severity ?? getPluginSeverity(plugin.id, resolvePluginConfig(plugin.config)),
      modifiers: {
        ...pluginModifiers,
        ...test.metadata?.modifiers,
        // Add language to modifiers if not already present (respect existing)
        ...languageToAdd,
      },
      // Hoist language to top-level metadata for backward compatibility and easier access
      ...languageToAdd,
      ...getMaterializedMultiInputPromptMetadata(test.vars),
    },
  };
}

type CountSummary = { requested: number; generated: number };
type CountSummaryMap = Record<string, CountSummary>;
type PluginConfig = SynthesizeOptions['plugins'][number];

interface PluginGenerationContext {
  redteamProvider: ApiProvider;
  purpose: string;
  injectVar: string;
  delay?: number;
  language: SynthesizeOptions['language'];
  inputs?: Inputs;
  hasMultipleInputs: boolean;
  maxCharsPerMessage?: number;
  testGenerationInstructions?: string;
  needsGoalExtraction: boolean;
}

interface PluginLanguageResult {
  lang: string | undefined;
  tests: TestCaseWithPlugin[];
  requested: number;
  generated: number;
}

interface PluginGenerationSummary {
  tests: TestCaseWithPlugin[];
  reportEntries: CountSummaryMap;
  generatedCount: number;
  progressIncrement: number;
  shouldLogGenerated: boolean;
}

function getConfiguredLanguages(
  plugin: PluginConfig,
  language: SynthesizeOptions['language'],
): Array<string | undefined> {
  const languageConfig = plugin.config?.language ?? language;
  return Array.isArray(languageConfig)
    ? languageConfig
    : languageConfig
      ? [languageConfig]
      : [undefined];
}

function collectLanguageResults(
  plugin: PluginConfig,
  languages: Array<string | undefined>,
  languageResults: PromiseSettledResult<PluginLanguageResult>[],
  logPrefix: string,
): { tests: TestCaseWithPlugin[]; resultsPerLanguage: CountSummaryMap } {
  const tests: TestCaseWithPlugin[] = [];
  const resultsPerLanguage: CountSummaryMap = {};

  for (const [index, result] of languageResults.entries()) {
    const lang = languages[index];
    const langKey = lang || 'default';

    if (result.status === 'fulfilled') {
      tests.push(...result.value.tests);
      resultsPerLanguage[langKey] = {
        requested: result.value.requested,
        generated: result.value.generated,
      };
      continue;
    }

    logger.warn(`${logPrefix} ${plugin.id}: ${result.reason}`);
    resultsPerLanguage[langKey] = { requested: plugin.numTests, generated: 0 };
  }

  return { tests, resultsPerLanguage };
}

async function extractGoalsForTests(
  tests: TestCaseWithPlugin[],
  injectVar: string,
  purpose: string,
  pluginId: string,
): Promise<void> {
  for (const testCase of tests) {
    const promptVar = testCase.vars?.[injectVar];
    const prompt = Array.isArray(promptVar) ? promptVar[0] : String(promptVar);
    const policy = getPolicyText(testCase.metadata);
    const extractedGoal = await extractGoalFromPrompt(prompt, purpose, pluginId, policy);

    (testCase.metadata as any).goal = extractedGoal;
  }
}

function buildPluginReportEntries(
  plugin: PluginConfig,
  languages: Array<string | undefined>,
  resultsPerLanguage: CountSummaryMap,
  generatedCount: number,
  language: SynthesizeOptions['language'],
  intentUsesGeneratedCount: boolean,
): CountSummaryMap {
  const baseDisplayId = getPluginDisplayId(plugin);
  const definedLanguages = languages.filter((lang): lang is string => lang !== undefined);

  if (definedLanguages.length <= 1) {
    const requested =
      intentUsesGeneratedCount && plugin.id === 'intent'
        ? generatedCount
        : getExpectedPluginTestCount(plugin, language);
    return { [baseDisplayId]: { requested, generated: generatedCount } };
  }

  return Object.fromEntries(
    Object.entries(resultsPerLanguage).map(([langKey, result]) => {
      const displayId = langKey === 'en' ? baseDisplayId : `(${langKey}) ${baseDisplayId}`;
      const requested =
        intentUsesGeneratedCount && plugin.id === 'intent' ? result.generated : result.requested;
      return [displayId, { requested, generated: result.generated }];
    }),
  );
}

async function generateRegisteredPluginTestsForLanguage(
  action: NonNullable<(typeof Plugins)[number]['action']>,
  plugin: PluginConfig,
  lang: string | undefined,
  context: PluginGenerationContext,
): Promise<PluginLanguageResult> {
  const pluginTests = await action({
    provider: context.redteamProvider,
    purpose: context.purpose,
    injectVar: context.injectVar,
    n: plugin.numTests,
    delayMs: context.delay || 0,
    config: {
      ...resolvePluginConfigWithMaxChars(plugin.config, context.maxCharsPerMessage),
      ...(lang ? { language: lang } : {}),
      ...(context.hasMultipleInputs ? { inputs: context.inputs } : {}),
      modifiers: buildRedteamModifiers({
        maxCharsPerMessage: context.maxCharsPerMessage,
        pluginConfig: plugin.config,
        testGenerationInstructions: context.testGenerationInstructions,
      }),
    },
  });

  if (!Array.isArray(pluginTests) || pluginTests.length === 0) {
    logger.warn(
      `[Language Processing] No tests generated for ${plugin.id} in language: ${lang || 'default'}`,
    );
    return { lang, tests: [], requested: plugin.numTests, generated: 0 };
  }

  const testsWithMetadata = pluginTests.map((test) =>
    addLanguageToPluginMetadata(
      test,
      lang,
      plugin,
      context.maxCharsPerMessage,
      context.testGenerationInstructions,
    ),
  );
  const constrainedTests = filterOversizedTestCases(
    testsWithMetadata,
    context.injectVar,
    `Plugin ${plugin.id}`,
    context.maxCharsPerMessage,
  ) as TestCaseWithPlugin[];

  return {
    lang,
    tests: constrainedTests,
    requested: plugin.numTests,
    generated: constrainedTests.length,
  };
}

async function generateRegisteredPluginTests(
  plugin: PluginConfig,
  action: NonNullable<(typeof Plugins)[number]['action']>,
  context: PluginGenerationContext,
): Promise<PluginGenerationSummary> {
  logger.debug(`Generating tests for ${plugin.id}...`);
  const languages = getConfiguredLanguages(plugin, context.language);
  logger.debug(
    `[Language Processing] Plugin: ${plugin.id}, Languages: ${JSON.stringify(languages)}, NumTests per language: ${plugin.numTests}${plugin.config?.language ? ' (plugin override)' : ''}`,
  );

  const languageResults = await Promise.allSettled(
    languages.map((lang) =>
      generateRegisteredPluginTestsForLanguage(action, plugin, lang, context),
    ),
  );
  const { tests, resultsPerLanguage } = collectLanguageResults(
    plugin,
    languages,
    languageResults,
    '[Language Processing] Error generating tests for',
  );

  logger.debug(
    `[Language Processing] Total tests generated for ${plugin.id}: ${tests.length} (across ${languages.length} language(s))`,
  );

  if (tests.length === 0) {
    logger.warn(`Failed to generate tests for ${plugin.id}`);
  } else if (context.needsGoalExtraction) {
    logger.debug(`Extracting goal for ${tests.length} tests from ${plugin.id}...`);
    await extractGoalsForTests(tests, context.injectVar, context.purpose, plugin.id);
  }

  logger.debug(`Added ${tests.length} ${plugin.id} test cases`);

  return {
    tests,
    reportEntries: buildPluginReportEntries(
      plugin,
      languages,
      resultsPerLanguage,
      tests.length,
      context.language,
      true,
    ),
    generatedCount: tests.length,
    progressIncrement: getExpectedPluginTestCount(plugin, context.language),
    shouldLogGenerated: true,
  };
}

async function generateCustomPluginTestsForLanguage(
  plugin: PluginConfig,
  lang: string | undefined,
  context: PluginGenerationContext,
): Promise<PluginLanguageResult> {
  const resolvedConfig = {
    ...resolvePluginConfigWithMaxChars(plugin.config, context.maxCharsPerMessage),
    ...(lang ? { language: lang } : {}),
    ...(context.hasMultipleInputs ? { inputs: context.inputs } : {}),
  };
  const customPluginConfig = {
    ...resolvedConfig,
    modifiers: buildRedteamModifiers({
      maxCharsPerMessage: context.maxCharsPerMessage,
      pluginConfig: resolvedConfig,
      testGenerationInstructions: context.testGenerationInstructions,
    }),
  };
  const customPlugin = new CustomPlugin(
    context.redteamProvider,
    context.purpose,
    context.injectVar,
    plugin.id,
    customPluginConfig,
  );
  const customTests = await customPlugin.generateTests(plugin.numTests, context.delay);
  const tests = filterOversizedTestCases(
    customTests.map((test) =>
      addLanguageToPluginMetadata(
        test,
        lang,
        plugin,
        context.maxCharsPerMessage,
        context.testGenerationInstructions,
      ),
    ),
    context.injectVar,
    `Custom plugin ${plugin.id}`,
    context.maxCharsPerMessage,
  ) as TestCaseWithPlugin[];

  return {
    lang,
    tests,
    requested: plugin.numTests,
    generated: tests.length,
  };
}

async function generateCustomPluginTests(
  plugin: PluginConfig,
  context: PluginGenerationContext,
): Promise<PluginGenerationSummary> {
  try {
    const languages = getConfiguredLanguages(plugin, context.language);
    const languageResults = await Promise.allSettled(
      languages.map((lang) => generateCustomPluginTestsForLanguage(plugin, lang, context)),
    );
    const { tests, resultsPerLanguage } = collectLanguageResults(
      plugin,
      languages,
      languageResults,
      '[Language Processing] Error generating tests for custom plugin',
    );

    if (context.needsGoalExtraction) {
      logger.debug(`Extracting goal for ${tests.length} custom tests from ${plugin.id}...`);
      await extractGoalsForTests(tests, context.injectVar, context.purpose, plugin.id);
    }

    logger.debug(`Added ${tests.length} custom test cases from ${plugin.id}`);

    return {
      tests,
      reportEntries: buildPluginReportEntries(
        plugin,
        languages,
        resultsPerLanguage,
        tests.length,
        context.language,
        false,
      ),
      generatedCount: tests.length,
      progressIncrement: getExpectedPluginTestCount(plugin, context.language),
      shouldLogGenerated: false,
    };
  } catch (error) {
    logger.error(`Error generating tests for custom plugin ${plugin.id}: ${error}`);
    const displayId = getPluginDisplayId(plugin);
    return {
      tests: [],
      reportEntries: { [displayId]: { requested: plugin.numTests, generated: 0 } },
      generatedCount: 0,
      progressIncrement: 0,
      shouldLogGenerated: false,
    };
  }
}

function generateSkippedPluginResult(plugin: PluginConfig): PluginGenerationSummary {
  logger.warn(`Plugin ${plugin.id} not registered, skipping`);
  const displayId = getPluginDisplayId(plugin);
  return {
    tests: [],
    reportEntries: { [displayId]: { requested: plugin.numTests, generated: 0 } },
    generatedCount: 0,
    progressIncrement: plugin.numTests,
    shouldLogGenerated: false,
  };
}

async function generateTestsForPlugin(
  plugin: PluginConfig,
  context: PluginGenerationContext,
): Promise<PluginGenerationSummary> {
  const action = Plugins.find((candidate) => candidate.key === plugin.id)?.action;
  if (action) {
    return generateRegisteredPluginTests(plugin, action, context);
  }
  if (plugin.id.startsWith('file://')) {
    return generateCustomPluginTests(plugin, context);
  }
  return generateSkippedPluginResult(plugin);
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

type StrategyAction = NonNullable<(typeof Strategies)[number]['action']>;

async function resolveStrategyAction(
  strategy: RedteamStrategyObject,
): Promise<StrategyAction | undefined> {
  if (strategy.id.startsWith('file://')) {
    const loadedStrategy = await loadStrategy(strategy.id);
    return loadedStrategy.action as StrategyAction;
  }

  let builtinStrategy = Strategies.find((candidate) => candidate.id === strategy.id);
  if (!builtinStrategy && strategy.id.includes(':')) {
    const baseStrategyId = strategy.id.split(':')[0];
    builtinStrategy = Strategies.find((candidate) => candidate.id === baseStrategyId);
  }

  if (!builtinStrategy) {
    logger.warn(`Strategy ${strategy.id} not registered, skipping`);
    return undefined;
  }

  return builtinStrategy.action;
}

function getApplicableStrategyTestCases(
  testCases: TestCaseWithPlugin[],
  strategy: RedteamStrategyObject,
): TestCaseWithPlugin[] {
  const targetPlugins = strategy.config?.plugins;
  return testCases.filter((testCase) => {
    if (!pluginMatchesStrategyTargets(testCase, strategy.id, targetPlugins)) {
      return false;
    }
    if (testCase.metadata?.retry !== true) {
      return true;
    }

    logger.debug(
      `Skipping ${strategy.id} for retry test (plugin: ${testCase.metadata?.pluginId}) - retry tests are not transformed`,
    );
    return false;
  });
}

function getStrategyNumTestsLimit(strategy: RedteamStrategyObject): number | undefined {
  const numTestsLimit = strategy.config?.numTests;
  return typeof numTestsLimit === 'number' && Number.isFinite(numTestsLimit) && numTestsLimit >= 0
    ? numTestsLimit
    : undefined;
}

function shouldSkipStrategyForLimit(
  strategy: RedteamStrategyObject,
  numTestsLimit: number | undefined,
): boolean {
  if (numTestsLimit !== 0) {
    return false;
  }
  logger.warn(`[Strategy] ${strategy.id}: numTests=0 configured, skipping strategy`);
  return true;
}

function limitStrategyInputTestCases(
  strategy: RedteamStrategyObject,
  applicableTestCases: TestCaseWithPlugin[],
  numTestsLimit: number | undefined,
): TestCaseWithPlugin[] {
  if (!numTestsLimit || applicableTestCases.length <= numTestsLimit) {
    return applicableTestCases;
  }

  logger.debug(
    `[Strategy] ${strategy.id}: Pre-limiting ${applicableTestCases.length} tests to numTests=${numTestsLimit}`,
  );
  return applicableTestCases.slice(0, numTestsLimit);
}

function capStrategyResultTestCases(
  strategy: RedteamStrategyObject,
  resultTestCases: TestCase[],
  numTestsLimit: number | undefined,
): TestCase[] {
  if (!numTestsLimit || resultTestCases.length <= numTestsLimit) {
    return resultTestCases;
  }

  logger.warn(
    `[Strategy] ${strategy.id}: Post-cap safety net applied (${resultTestCases.length} -> ${numTestsLimit}). Strategy generated more tests than input.`,
  );
  return resultTestCases.slice(0, numTestsLimit);
}

async function materializeStrategyTestCases(
  resultTestCases: TestCase[],
  strategy: RedteamStrategyObject,
  injectVar: string,
  provider: ApiProvider,
  purpose: string,
  maxCharsPerMessage?: number,
): Promise<TestCaseWithPlugin[]> {
  return Promise.all(
    resultTestCases.map(async (testCase, materializationIndex) => {
      const { inputMaterialization, vars } = await rematerializeStrategyInputVars(
        testCase,
        injectVar,
        provider,
        purpose,
        materializationIndex,
      );
      const strategyConfig = {
        ...(strategy.config || {}),
        ...(maxCharsPerMessage ? { maxCharsPerMessage } : {}),
        ...(testCase.metadata?.strategyConfig || {}),
      };

      return {
        ...testCase,
        vars,
        metadata: {
          ...(testCase.metadata || {}),
          ...(strategy.id !== 'retry' && {
            strategyId: testCase.metadata?.strategyId || strategy.id,
          }),
          ...(testCase.metadata?.pluginId && { pluginId: testCase.metadata.pluginId }),
          ...(testCase.metadata?.pluginConfig && {
            pluginConfig: testCase.metadata.pluginConfig,
          }),
          ...(inputMaterialization && {
            inputMaterialization,
          }),
          ...(Object.keys(strategyConfig).length > 0 && {
            strategyConfig,
          }),
          ...getMaterializedMultiInputPromptMetadata(vars),
        },
      } as TestCaseWithPlugin;
    }),
  );
}

function getStrategyDisplayId(strategy: RedteamStrategyObject): string {
  return strategy.id === 'layer' && Array.isArray(strategy.config?.steps)
    ? `layer(${(strategy.config!.steps as any[])
        .map((step) => (typeof step === 'string' ? step : step.id))
        .join('→')})`
    : strategy.id;
}

function getStrategyRequestMultiplier(strategy: RedteamStrategyObject): number {
  if (typeof strategy.config?.n === 'number') {
    return strategy.config.n;
  }
  return isFanoutStrategy(strategy.id) ? getDefaultNFanout(strategy.id) : 1;
}

function capStrategyRequestedCount(requested: number, numTestsLimit: number | undefined): number {
  return numTestsLimit === undefined ? requested : Math.min(requested, numTestsLimit);
}

function getStrategyLanguages(strategyTestCases: Array<TestCase | undefined>): Set<string> {
  return new Set(
    strategyTestCases
      .map((testCase) => getLanguageForTestCase(testCase))
      .filter((lang): lang is string => lang !== undefined),
  );
}

function buildStrategyReportEntries(
  strategy: RedteamStrategyObject,
  applicableTestCases: TestCaseWithPlugin[],
  resultTestCases: TestCase[],
  strategyTestCases: Array<TestCase | undefined>,
  numTestsLimit: number | undefined,
): CountSummaryMap {
  const displayId = getStrategyDisplayId(strategy);
  const languagesInResults = getStrategyLanguages(strategyTestCases);
  const multiplier = getStrategyRequestMultiplier(strategy);

  if (languagesInResults.size > 1) {
    return Object.fromEntries(
      [...languagesInResults].map((lang) => {
        const testsForLang = resultTestCases.filter(
          (testCase) => getLanguageForTestCase(testCase) === lang,
        );
        const applicableForLang = applicableTestCases.filter(
          (testCase) => getLanguageForTestCase(testCase) === lang,
        );
        const strategyDisplayId = lang === 'en' ? displayId : `${displayId} (${lang})`;
        return [
          strategyDisplayId,
          {
            requested: capStrategyRequestedCount(
              applicableForLang.length * multiplier,
              numTestsLimit,
            ),
            generated: testsForLang.length,
          },
        ];
      }),
    );
  }

  if (strategy.id === 'layer') {
    return {
      [displayId]: {
        requested: capStrategyRequestedCount(applicableTestCases.length, numTestsLimit),
        generated: resultTestCases.length,
      },
    };
  }

  return {
    [displayId]: {
      requested: capStrategyRequestedCount(applicableTestCases.length * multiplier, numTestsLimit),
      generated: resultTestCases.length,
    },
  };
}

async function applyStrategy(
  testCases: TestCaseWithPlugin[],
  strategy: RedteamStrategyObject,
  injectVar: string,
  provider: ApiProvider,
  purpose: string,
  excludeTargetOutputFromAgenticAttackGeneration?: boolean,
  maxCharsPerMessage?: number,
): Promise<{ testCases: TestCaseWithPlugin[]; strategyResults: CountSummaryMap } | undefined> {
  logger.debug(`Generating ${strategy.id} tests`);

  const strategyAction = await resolveStrategyAction(strategy);
  if (!strategyAction) {
    return undefined;
  }

  const applicableTestCases = getApplicableStrategyTestCases(testCases, strategy);
  const numTestsLimit = getStrategyNumTestsLimit(strategy);
  if (shouldSkipStrategyForLimit(strategy, numTestsLimit)) {
    return undefined;
  }

  const strategyTestCases = await strategyAction(
    limitStrategyInputTestCases(strategy, applicableTestCases, numTestsLimit),
    injectVar,
    {
      ...(strategy.config || {}),
      ...(maxCharsPerMessage ? { maxCharsPerMessage } : {}),
      redteamProvider: cliState.config?.redteam?.provider,
      excludeTargetOutputFromAgenticAttackGeneration,
    },
    strategy.id,
  );

  let resultTestCases = strategyTestCases.filter(
    (testCase): testCase is NonNullable<typeof testCase> =>
      testCase !== null && testCase !== undefined,
  );
  resultTestCases = capStrategyResultTestCases(strategy, resultTestCases, numTestsLimit);
  resultTestCases = filterOversizedTestCases(
    resultTestCases,
    injectVar,
    `Strategy ${strategy.id}`,
    maxCharsPerMessage,
  );

  return {
    testCases: await materializeStrategyTestCases(
      resultTestCases,
      strategy,
      injectVar,
      provider,
      purpose,
      maxCharsPerMessage,
    ),
    strategyResults: buildStrategyReportEntries(
      strategy,
      applicableTestCases,
      resultTestCases,
      strategyTestCases,
      numTestsLimit,
    ),
  };
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
  provider: ApiProvider,
  purpose: string,
  excludeTargetOutputFromAgenticAttackGeneration?: boolean,
  maxCharsPerMessage?: number,
): Promise<{
  testCases: TestCaseWithPlugin[];
  strategyResults: Record<string, { requested: number; generated: number }>;
}> {
  const newTestCases: TestCaseWithPlugin[] = [];
  const strategyResults: CountSummaryMap = {};

  for (const strategy of strategies) {
    const result = await applyStrategy(
      testCases,
      strategy,
      injectVar,
      provider,
      purpose,
      excludeTargetOutputFromAgenticAttackGeneration,
      maxCharsPerMessage,
    );
    if (result) {
      newTestCases.push(...result.testCases);
      Object.assign(strategyResults, result.strategyResults);
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
    return sum + getExpectedPluginTestCount(p, language);
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

function createAbortChecker(abortSignal: SynthesizeOptions['abortSignal']): () => void {
  return () => {
    if (abortSignal?.aborted) {
      throw new Error('Operation cancelled');
    }
  };
}

function normalizeMaxConcurrency(delay: number | undefined, maxConcurrency: number): number {
  if (delay && maxConcurrency > 1) {
    logger.warn('Delay is enabled, setting max concurrency to 1.');
    return 1;
  }
  if (maxConcurrency > MAX_MAX_CONCURRENCY) {
    logger.info(`Max concurrency for test generation is capped at ${MAX_MAX_CONCURRENCY}.`);
    return MAX_MAX_CONCURRENCY;
  }
  return maxConcurrency;
}

function expandStrategyCollections(strategies: RedteamStrategyObject[]): RedteamStrategyObject[] {
  const expandedStrategies: RedteamStrategyObject[] = [];
  for (const strategy of strategies) {
    if (!isStrategyCollection(strategy.id)) {
      expandedStrategies.push(strategy);
      continue;
    }

    const aliasedStrategies = STRATEGY_COLLECTION_MAPPINGS[strategy.id];
    if (!aliasedStrategies) {
      logger.warn(`Strategy collection ${strategy.id} has no mappings, skipping`);
      continue;
    }

    expandedStrategies.push(
      ...aliasedStrategies.map((strategyId) => ({ ...strategy, id: strategyId })),
    );
  }
  return expandedStrategies;
}

function getStrategyDedupKey(strategy: RedteamStrategyObject): string {
  if (strategy.id !== 'layer' || !strategy.config) {
    return strategy.id;
  }

  const config = strategy.config as Record<string, unknown>;
  if (typeof config.label === 'string' && config.label.trim()) {
    return `layer/${config.label}`;
  }
  if (Array.isArray(config.steps)) {
    const steps = (config.steps as Array<string | { id?: string }>).map((step) =>
      typeof step === 'string' ? step : (step?.id ?? 'unknown'),
    );
    return `layer:${steps.join('->')}`;
  }
  return strategy.id;
}

function dedupeStrategies(strategies: RedteamStrategyObject[]): RedteamStrategyObject[] {
  const seen = new Set<string>();
  return strategies.filter((strategy) => {
    const key = getStrategyDedupKey(strategy);
    if (seen.has(key)) {
      logger.debug(`[Synthesize] Skipping duplicate strategy: ${key}`);
      return false;
    }
    seen.add(key);
    return true;
  });
}

function formatPluginSummary(
  plugin: PluginConfig,
  language: SynthesizeOptions['language'],
): string {
  const actualTestCount = getExpectedPluginTestCount(plugin, language);
  let configSummary = '';

  if (plugin.config) {
    if (plugin.id === 'policy') {
      const policy = plugin.config.policy as Policy;
      if (isValidPolicyObject(policy)) {
        const policyText = policy.text!.trim().replace(/\n+/g, ' ');
        const truncated = policyText.length > 70 ? policyText.slice(0, 70) + '...' : policyText;
        if (policy.name) {
          configSummary = ` ${policy.name}:`;
        }
        configSummary += ` "${truncated}"`;
      } else {
        const policyText = policy.trim().replace(/\n+/g, ' ');
        const truncated = policyText.length > 70 ? policyText.slice(0, 70) + '...' : policyText;
        configSummary = truncated;
      }
    } else {
      configSummary = ' (custom config)';
    }
    logger.debug('Plugin config', {
      pluginId: plugin.id,
      configKeyCount: Object.keys(plugin.config).length,
    });
  }

  return `${plugin.id} (${formatTestCount(actualTestCount, false)})${configSummary}`;
}

function formatStrategySummary(strategy: RedteamStrategyObject, totalPluginTests: number): string {
  const multiplier = getStrategyRequestMultiplier(strategy);
  let testCount = totalPluginTests * multiplier;
  const numTestsCap = getStrategyNumTestsLimit(strategy);
  if (numTestsCap !== undefined) {
    testCount = Math.min(testCount, numTestsCap);
  }
  return `${strategy.id} (${formatTestCount(testCount, true)})`;
}

function logSynthesisOverview(
  prompts: string[],
  plugins: PluginConfig[],
  strategies: RedteamStrategyObject[],
  language: SynthesizeOptions['language'],
  totalPluginTests: number,
  totalTests: number,
  effectiveStrategyCount: number,
  maxConcurrency: number,
  delay?: number,
): void {
  logger.info(
    `Synthesizing test cases for ${prompts.length} ${
      prompts.length === 1 ? 'prompt' : 'prompts'
    }...\nUsing plugins:\n\n${chalk.yellow(
      plugins
        .map((plugin) => formatPluginSummary(plugin, language))
        .sort()
        .join('\n'),
    )}\n`,
  );

  if (strategies.length > 0) {
    logger.info(
      `Using strategies:\n\n${chalk.yellow(
        strategies
          .filter((strategy) => !['basic', 'retry'].includes(strategy.id))
          .map((strategy) => formatStrategySummary(strategy, totalPluginTests))
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
}

function prepareMultiInputMode(
  plugins: PluginConfig[],
  injectVar: string | undefined,
  inputs: Inputs | undefined,
): { plugins: PluginConfig[]; injectVar: string | undefined; hasMultipleInputs: boolean } {
  const hasMultipleInputs = Boolean(inputs && Object.keys(inputs).length > 0);
  if (!hasMultipleInputs) {
    return { plugins, injectVar, hasMultipleInputs };
  }

  const inputKeys = Object.keys(inputs!);
  logger.info(`Using multi-input mode with ${inputKeys.length} variables: ${inputKeys.join(', ')}`);
  const multiInputExcluded = [...DATASET_EXEMPT_PLUGINS, ...MULTI_INPUT_EXCLUDED_PLUGINS];
  const removedPlugins = plugins.filter((plugin) => multiInputExcluded.includes(plugin.id as any));
  const filteredPlugins = plugins.filter(
    (plugin) => !multiInputExcluded.includes(plugin.id as any),
  );

  if (removedPlugins.length > 0) {
    logger.info(
      `Skipping ${removedPlugins.length} plugin${removedPlugins.length > 1 ? 's' : ''} in multi-input mode: ${removedPlugins.map((plugin) => plugin.id).join(', ')}`,
    );
  }

  return { plugins: filteredPlugins, injectVar: MULTI_INPUT_VAR, hasMultipleInputs };
}

function resolveInjectVar(injectVar: string | undefined, prompts: string[]): string {
  if (typeof injectVar === 'string') {
    return injectVar;
  }

  const parsedVars = extractVariablesFromTemplates(prompts);
  if (parsedVars.length > 1) {
    logger.warn(
      `\nMultiple variables found in prompts: ${parsedVars.join(', ')}. Using the last one "${parsedVars[parsedVars.length - 1]}". Override this selection with --injectVar`,
    );
  } else if (parsedVars.length === 0) {
    logger.warn('No variables found in prompts. Using "query" as the inject variable.');
  }

  const resolvedInjectVar = parsedVars[parsedVars.length - 1] || 'query';
  invariant(
    typeof resolvedInjectVar === 'string',
    `Inject var must be a string, got ${resolvedInjectVar}`,
  );
  return resolvedInjectVar;
}

function expandPlugins(
  plugins: PluginConfig[],
  strategies: RedteamStrategyObject[],
): PluginConfig[] {
  const expandedPlugins: PluginConfig[] = [];
  const pluginQueue = [...plugins];

  for (const [category, categoryPlugins] of Object.entries(categories)) {
    const plugin = plugins.find((candidate) => candidate.id === category);
    if (plugin) {
      pluginQueue.push(...categoryPlugins.map((id) => ({ id, numTests: plugin.numTests })));
    }
  }

  const expandPlugin = (
    plugin: PluginConfig,
    mapping: { plugins: string[]; strategies: string[] },
  ) => {
    expandedPlugins.push(...mapping.plugins.map((id) => ({ id, numTests: plugin.numTests })));
    strategies.push(...mapping.strategies.map((id) => ({ id })));
  };

  for (const plugin of pluginQueue) {
    if (Plugins.some((candidate) => candidate.key === plugin.id)) {
      expandedPlugins.push(plugin);
      continue;
    }

    const mappingKey = Object.keys(ALIASED_PLUGIN_MAPPINGS).find(
      (key) => plugin.id === key || plugin.id.startsWith(`${key}:`),
    );
    if (!mappingKey) {
      expandedPlugins.push(plugin);
      continue;
    }

    const mapping =
      ALIASED_PLUGIN_MAPPINGS[mappingKey][plugin.id] ||
      Object.values(ALIASED_PLUGIN_MAPPINGS[mappingKey]).find((_mapping) =>
        plugin.id.startsWith(`${mappingKey}:`),
      );
    if (mapping) {
      expandPlugin(plugin, mapping);
    }
  }

  return expandedPlugins;
}

function validatePlugins(
  plugins: PluginConfig[],
  language: SynthesizeOptions['language'],
  maxCharsPerMessage: number | undefined,
  testGenerationInstructions: string | undefined,
): PluginConfig[] {
  logger.debug('Validating plugins...');
  return [...new Set(plugins)]
    .filter((plugin) => {
      if (Object.keys(categories).includes(plugin.id)) {
        return false;
      }

      const registeredPlugin = Plugins.find((candidate) => candidate.key === plugin.id);
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
        const resolvedPluginConfig = resolvePluginConfigWithMaxChars(
          plugin.config,
          maxCharsPerMessage,
        );
        registeredPlugin.validate({
          language,
          ...resolvedPluginConfig,
          modifiers: buildRedteamModifiers({
            maxCharsPerMessage,
            pluginConfig: resolvedPluginConfig,
            testGenerationInstructions,
          }),
        });
        return true;
      } catch (error) {
        logger.warn(`Validation failed for plugin ${plugin.id}: ${error}, skipping plugin.`);
        return false;
      }
    })
    .sort();
}

async function ensureRemoteGenerationHealthy(): Promise<void> {
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

function createProgressBar(
  showProgressBarOverride: boolean | undefined,
  totalTests: number,
): { progressBar: cliProgress.SingleBar | null; showProgressBar: boolean } {
  const isWebUI = Boolean(cliState.webUI);
  const showProgressBar =
    !isWebUI &&
    getEnvString('LOG_LEVEL') !== 'debug' &&
    getLogLevel() !== 'debug' &&
    showProgressBarOverride !== false;

  if (!showProgressBar) {
    return { progressBar: null, showProgressBar };
  }

  const progressBar = new cliProgress.SingleBar(
    {
      format: 'Generating | {bar} | {percentage}% | {value}/{total} | {task}',
      gracefulExit: true,
    },
    cliProgress.Presets.shades_classic,
  );
  progressBar.start(totalTests, 0, { task: 'Initializing' });
  return { progressBar, showProgressBar };
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
  maxCharsPerMessage,
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
  const checkAbort = createAbortChecker(abortSignal);
  checkAbort();

  if (prompts.length === 0) {
    throw new Error('Prompts array cannot be empty');
  }
  maxConcurrency = normalizeMaxConcurrency(delay, maxConcurrency);
  strategies = dedupeStrategies(expandStrategyCollections(strategies));

  // Only extract intent/goal when strategies that need it are selected
  const needsGoalExtraction = strategies.some(
    (s) => Strategies.find((def) => def.id === s.id)?.requiresGoalExtraction,
  );

  await validateStrategies(strategies);
  await validateSharpDependency(strategies, plugins);

  const redteamProvider = await redteamProviderManager.getProvider({
    provider,
  });

  const { effectiveStrategyCount, includeBasicTests, totalPluginTests, totalTests } =
    calculateTotalTests(plugins, strategies, language);
  logSynthesisOverview(
    prompts,
    plugins,
    strategies,
    language,
    totalPluginTests,
    totalTests,
    effectiveStrategyCount,
    maxConcurrency,
    delay,
  );

  const multiInputState = prepareMultiInputMode(plugins, injectVar, inputs);
  plugins = multiInputState.plugins;
  injectVar = resolveInjectVar(multiInputState.injectVar, prompts);
  const hasMultipleInputs = multiInputState.hasMultipleInputs;
  plugins = validatePlugins(
    expandPlugins(plugins, strategies),
    language,
    maxCharsPerMessage,
    testGenerationInstructions,
  );

  await ensureRemoteGenerationHealthy();
  const { progressBar, showProgressBar } = createProgressBar(showProgressBarOverride, totalTests);

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
    checkAbort();
    if (showProgressBar) {
      progressBar?.update({ task: plugin.id });
    } else {
      logger.info(`Generating tests for ${plugin.id}...`);
    }

    const generation = await generateTestsForPlugin(plugin, {
      redteamProvider,
      purpose,
      injectVar,
      delay,
      language,
      inputs,
      hasMultipleInputs,
      maxCharsPerMessage,
      testGenerationInstructions,
      needsGoalExtraction,
    });
    testCases.push(...generation.tests);
    Object.assign(pluginResults, generation.reportEntries);

    if (showProgressBar) {
      progressBar?.increment(generation.progressIncrement);
    } else if (generation.shouldLogGenerated) {
      logger.info(`Generated ${generation.generatedCount} tests for ${plugin.id}`);
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
      redteamProvider,
      purpose,
      undefined,
      maxCharsPerMessage,
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
      redteamProvider,
      purpose,
      excludeTargetOutputFromAgenticAttackGeneration,
      maxCharsPerMessage,
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
