import chalk from 'chalk';
import { generateShortProviderHash, getProviderId } from '../canary';
import logger from '../logger';
import { REQUEST_TIMEOUT_MS } from '../providers/shared';
import {
  getRemoteGenerationUrl,
  neverGenerateRemoteForRegularEvals,
} from '../redteam/remoteGeneration';
import telemetry from '../telemetry';
import { setupEnv } from '../util';
import { resolveConfigs } from '../util/config/load';
import { fetchWithProxy } from '../util/fetch/index';
import { safeJsonStringify } from '../util/json';
import type { Command } from 'commander';

import type { ApiProvider, ProviderResponse, UnifiedConfig } from '../types';

// Types for server responses
interface CanaryTokensResponse {
  canaryTokens: string[];
}

interface ProbesResponse {
  probes: { type: string; message: string }[];
  detectionPatterns: { pattern: string; confidence?: number; type: string; description?: string }[];
}

type CanaryProbe = ProbesResponse['probes'][number];
type DetectionPattern = ProbesResponse['detectionPatterns'][number];

interface CanarySendResult {
  success: boolean;
  hash: string;
  tokens: string[];
}

interface CanaryMatch {
  pattern: string;
  confidence: number;
  context: string;
  description: string;
}

interface CanaryCheckResult {
  detected: boolean;
  hash: string;
  matches?: CanaryMatch[];
  confidence?: number;
}

function getConfigPaths(configPath: string | undefined, defaultConfigPath: string | undefined) {
  if (configPath) {
    return [configPath];
  }
  return defaultConfigPath ? [defaultConfigPath] : undefined;
}

async function requestCanaryTask<T>(payload: Record<string, unknown>): Promise<T> {
  if (neverGenerateRemoteForRegularEvals()) {
    throw new Error(
      'Canary generation requires remote generation. Unset PROMPTFOO_DISABLE_REMOTE_GENERATION or set PROMPTFOO_REMOTE_GENERATION_URL to a compatible endpoint.',
    );
  }

  const response = await fetchWithProxy(
    getRemoteGenerationUrl(),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  );

  if (!response.ok) {
    const errorMessage = await response.text();
    throw new Error(
      `Remote canary task failed with status ${response.status}: ${response.statusText} ${errorMessage}`,
    );
  }

  return (await response.json()) as T;
}

function responseValueToString(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return safeJsonStringify(value) ?? '';
}

export function extractResponseContent(result: unknown): string {
  if (typeof result === 'string') {
    return result;
  }

  if (!result || typeof result !== 'object') {
    return '';
  }

  const response = result as ProviderResponse & {
    choices?: { message?: { content?: unknown }; text?: unknown }[];
    content?: unknown;
    message?: unknown;
  };

  if (response.output != null) {
    return responseValueToString(response.output);
  }
  if (response.message != null) {
    return responseValueToString(response.message);
  }
  if (response.content != null) {
    return responseValueToString(response.content);
  }
  if (Array.isArray(response.choices) && response.choices.length > 0) {
    const [choice] = response.choices;
    return responseValueToString(choice.message?.content ?? choice.text);
  }

  return '';
}

function selectProbes(probes: CanaryProbe[], checkMode: string): CanaryProbe[] {
  if (checkMode !== 'auto') {
    const probesForMode = probes.filter((probe) => probe.type === checkMode);
    return (probesForMode.length > 0 ? probesForMode : probes).slice(0, 2);
  }

  const probesByType = probes.reduce<Record<string, CanaryProbe[]>>((acc, probe) => {
    acc[probe.type] ??= [];
    acc[probe.type].push(probe);
    return acc;
  }, {});

  const selected = ['direct', 'fact', 'semantic', 'general']
    .map((type) => probesByType[type]?.[0])
    .filter((probe): probe is CanaryProbe => Boolean(probe));

  return selected.length >= 2 ? selected : probes.slice(0, 2);
}

function getMatchContext(content: string, position: number, length: number): string {
  const start = Math.max(0, position - 40);
  const end = Math.min(content.length, position + length + 40);
  return content.substring(start, end);
}

function scanDetectionPattern(content: string, pattern: DetectionPattern): CanaryMatch[] {
  const patternText = pattern.pattern;
  const confidence = pattern.confidence || 0.5;

  if (pattern.type === 'exact' && content.includes(patternText)) {
    return [
      {
        pattern: patternText,
        confidence,
        context: getMatchContext(content, content.indexOf(patternText), patternText.length),
        description: pattern.description || 'Exact match',
      },
    ];
  }

  if (pattern.type === 'partial') {
    const lowerContent = content.toLowerCase();
    const lowerPattern = patternText.toLowerCase();
    if (lowerContent.includes(lowerPattern)) {
      return [
        {
          pattern: patternText,
          confidence: confidence * 0.8,
          context: getMatchContext(
            content,
            lowerContent.indexOf(lowerPattern),
            lowerPattern.length,
          ),
          description: pattern.description || 'Partial match',
        },
      ];
    }
  }

  if (pattern.type === 'semantic') {
    const matchedWord = patternText
      .split(/\s+/)
      .filter((word) => word.length > 4)
      .find((word) => content.toLowerCase().includes(word.toLowerCase()));

    if (matchedWord) {
      return [
        {
          pattern: matchedWord,
          confidence: confidence * 0.6,
          context: getMatchContext(
            content,
            content.toLowerCase().indexOf(matchedWord.toLowerCase()),
            matchedWord.length,
          ),
          description: pattern.description || 'Semantic match',
        },
      ];
    }
  }

  return [];
}

function dedupeMatches(matches: CanaryMatch[]): CanaryMatch[] {
  const seenPatterns = new Set<string>();
  return matches.filter((match) => {
    const key = `${match.pattern}:${match.context}`;
    if (seenPatterns.has(key)) {
      return false;
    }
    seenPatterns.add(key);
    return true;
  });
}

function findDetectionMatches(content: string, patterns: DetectionPattern[]): CanaryMatch[] {
  return dedupeMatches(patterns.flatMap((pattern) => scanDetectionPattern(content, pattern)));
}

/**
 * Sends a canary to a single provider
 */
export async function sendCanaryToSingleProvider(
  provider: ApiProvider,
  customMessage?: string,
  repeat: number = 1,
): Promise<CanarySendResult> {
  const providerHash = generateShortProviderHash(provider);
  const providerId = getProviderId(provider);

  logger.debug(`Generated provider hash: ${providerHash}`);

  let canaryTokensToSend: string[];
  if (customMessage === undefined) {
    const response = await requestCanaryTask<CanaryTokensResponse>({
      task: 'generate-canary',
      hash: providerHash,
    });

    if (!response.canaryTokens || response.canaryTokens.length === 0) {
      throw new Error('Failed to generate canary tokens from server');
    }

    logger.info(
      `🔑 Generated ${response.canaryTokens.length} canary variations for provider: ${chalk.bold(providerId)}`,
    );
    canaryTokensToSend =
      repeat > 1
        ? response.canaryTokens.slice(0, Math.min(repeat, response.canaryTokens.length))
        : [response.canaryTokens[0]];
  } else {
    canaryTokensToSend = Array.from({ length: repeat }, () => customMessage);
    logger.info(
      `🔑 Sending ${repeat} custom canary ${repeat === 1 ? 'message' : 'messages'} to provider: ${chalk.bold(providerId)}`,
    );
  }

  for (const token of canaryTokensToSend) {
    logger.debug(
      `Sending canary token: ${token.substring(0, 30)}${token.length > 30 ? '...' : ''}`,
    );
    const result = await provider.callApi(token);
    if (result.error) {
      throw new Error(result.error);
    }
  }

  logger.info(`🔑 Canary hash for future reference: ${chalk.bold(providerHash)}`);

  return {
    success: true,
    hash: providerHash,
    tokens: canaryTokensToSend,
  };
}

/**
 * Sends a canary to all providers from config
 */
async function sendCanary(
  providers: ApiProvider[],
  customMessage?: string,
  repeat: number = 1,
): Promise<CanarySendResult[]> {
  if (providers.length === 0) {
    throw new Error('No providers found in config file');
  }

  logger.info(`Sending canaries to ${providers.length} providers from config...`);
  const results = [];
  let failedCount = 0;
  for (const provider of providers) {
    const providerId = getProviderId(provider);

    logger.info(`Sending canary to provider: ${chalk.bold(String(providerId))}`);
    try {
      const result = await sendCanaryToSingleProvider(provider, customMessage, repeat);
      results.push(result);
    } catch (error) {
      failedCount += 1;
      logger.error(`Failed to send canary to provider ${providerId}: ${(error as Error).message}`);
    }
  }
  if (failedCount > 0) {
    throw new Error(`Failed to send canaries to ${failedCount} of ${providers.length} providers`);
  }
  return results;
}

/**
 * Checks if a specific provider has leaked the canary
 */
export async function checkCanaryForSingleProvider(
  provider: ApiProvider,
  checkMode: string = 'auto',
): Promise<CanaryCheckResult> {
  const providerHash = generateShortProviderHash(provider);

  logger.debug(`Generated provider hash for checking: ${providerHash}`);

  const response = await requestCanaryTask<ProbesResponse>({
    task: 'generate-canary-probes',
    hash: providerHash,
  });

  if (!response || !response.probes || !response.detectionPatterns) {
    throw new Error(`Failed to generate canary check probes from server`);
  }

  const probesToUse = selectProbes(response.probes, checkMode);

  logger.info(`Using ${probesToUse.length} probe messages to check for canary leakage`);

  const detectedMatches: CanaryMatch[] = [];

  for (const probe of probesToUse) {
    logger.debug(`Sending probe: ${probe.message.substring(0, 50)}...`);
    const result = await provider.callApi(probe.message);
    if (result.error) {
      throw new Error(result.error);
    }

    const responseContent = extractResponseContent(result);

    logger.debug(`Got response (${responseContent.length} chars)`);

    detectedMatches.push(...findDetectionMatches(responseContent, response.detectionPatterns));
  }

  const uniqueMatches = dedupeMatches(detectedMatches);
  const highestConfidence = uniqueMatches.reduce(
    (highest, match) => Math.max(highest, match.confidence),
    0,
  );
  const detected = uniqueMatches.length > 0;

  if (detected) {
    logger.info(
      `⚠️  ${chalk.red('CANARY DETECTED!')} The provider has likely been trained on your data.`,
    );

    if (uniqueMatches.length > 0) {
      logger.info(`Found ${uniqueMatches.length} matches:`);
      uniqueMatches.forEach((match, i) => {
        logger.info(
          `  ${i + 1}. ${chalk.yellow(match.pattern)} (${Math.round(match.confidence * 100)}% confidence)`,
        );
        if (match.context) {
          logger.info(`     Context: ${chalk.gray(match.context)}`);
        }
        if (match.description) {
          logger.info(`     ${match.description}`);
        }
      });
    }

    const confidencePercent = Math.round(highestConfidence * 100);
    logger.info(`Overall confidence: ${chalk.yellow(confidencePercent + '%')}`);

    return {
      detected: true,
      matches: uniqueMatches,
      hash: providerHash,
      confidence: highestConfidence,
    };
  }

  const providerId = getProviderId(provider);
  logger.info(`✅ No canary detected for provider: ${chalk.bold(providerId)}`);
  logger.info(
    `This doesn't guarantee your data hasn't been used for training. Consider running more checks with different modes.`,
  );

  if (checkMode === 'auto') {
    logger.info(
      `Try using different check modes with --mode=direct, --mode=fact, or --mode=semantic`,
    );
  }

  return { detected: false, hash: providerHash };
}

/**
 * Checks if providers have leaked the canary
 */
async function checkCanary(
  providers: ApiProvider[],
  checkMode: string = 'auto',
): Promise<CanaryCheckResult[]> {
  if (providers.length === 0) {
    throw new Error('No providers found in config file');
  }

  logger.info(`Checking canaries for ${providers.length} providers from config...`);
  const results = [];
  let failedCount = 0;
  for (const provider of providers) {
    const providerId = getProviderId(provider);

    logger.info(`Checking canary for provider: ${chalk.bold(String(providerId))}`);
    try {
      const result = await checkCanaryForSingleProvider(provider, checkMode);
      results.push(result);
    } catch (error) {
      failedCount += 1;
      logger.error(
        `Failed to check canary for provider ${providerId}: ${(error as Error).message}`,
      );
    }
  }
  if (failedCount > 0) {
    throw new Error(`Failed to check canaries for ${failedCount} of ${providers.length} providers`);
  }
  return results;
}

/**
 * Register the canary command
 */
export default function registerCommand(
  program: Command,
  defaultConfig: Partial<UnifiedConfig>,
  defaultConfigPath: string | undefined,
) {
  const command = program
    .command('canary')
    .description(
      'Training canary utilities for detecting if your data has been used to train an LLM',
    )
    .addHelpText(
      'after',
      `
Examples:
  # Send canaries to all providers in your promptfooconfig.yaml
  $ promptfoo canary send

  # Check all providers in your promptfooconfig.yaml for canaries
  $ promptfoo canary check

  # Use a specific config file
  $ promptfoo canary send -c path/to/custom-promptfooconfig.yaml

  # Check with a specific mode
  $ promptfoo canary check --mode direct`,
    );

  // Send subcommand
  command
    .command('send')
    .description('Send a canary message to all providers in the config')
    .option('-m, --message <message>', 'Custom canary message to send')
    .option('-r, --repeat <number>', 'Number of canary variations to send', '1')
    .option('-c, --config <path>', 'Path to config file')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(async (options) => {
      try {
        telemetry.record('command_used', { name: 'canary send' });

        if (options.envPath) {
          setupEnv(options.envPath);
        }

        const repeat = Number.parseInt(options.repeat, 10);
        if (Number.isNaN(repeat) || repeat < 1) {
          throw new Error('The --repeat value must be a positive number');
        }

        // Load config and providers
        const { testSuite } = await resolveConfigs(
          { config: getConfigPaths(options.config, defaultConfigPath) },
          defaultConfig,
        );

        const _result = await sendCanary(testSuite.providers, options.message, repeat);
      } catch (error: unknown) {
        const err = error as Error;
        logger.error(`Error sending canary: ${err.message}`);
        process.exitCode = 1;
      }
    });

  // Check subcommand
  command
    .command('check')
    .description('Check if providers have been trained on your canary')
    .option('--mode <mode>', 'Check mode: auto, direct, fact, semantic', 'auto')
    .option('-c, --config <path>', 'Path to config file')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(async (options) => {
      try {
        telemetry.record('command_used', { name: 'canary check' });

        if (options.envPath) {
          setupEnv(options.envPath);
        }

        // Validate check mode
        const validModes = ['auto', 'direct', 'fact', 'semantic'];
        if (!validModes.includes(options.mode)) {
          throw new Error(
            `Invalid check mode: ${options.mode}. Valid modes are: ${validModes.join(', ')}`,
          );
        }

        // Load config and providers
        const { testSuite } = await resolveConfigs(
          { config: getConfigPaths(options.config, defaultConfigPath) },
          defaultConfig,
        );

        const result = await checkCanary(testSuite.providers, options.mode);

        // If any canary was detected, exit with code 1
        const anyDetection = result.some((r) => r && r.detected);
        process.exitCode = anyDetection ? 1 : 0;
      } catch (error: unknown) {
        const err = error as Error;
        logger.error(`Error checking canary: ${err.message}`);
        process.exitCode = 1;
      }
    });

  return command;
}
