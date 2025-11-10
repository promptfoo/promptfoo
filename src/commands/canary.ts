import chalk from 'chalk';
import type { Command } from 'commander';
import { generateShortProviderHash } from '../canary';
import logger from '../logger';
import telemetry from '../telemetry';
import type { ApiProvider, ProviderOptions, UnifiedConfig } from '../types';
import { setupEnv } from '../util';
import { makeRequest } from '../util/cloud';
import { resolveConfigs } from '../util/config/load';

// Types for server responses
interface CanaryTokensResponse {
  canaryTokens: string[];
}

interface ProbesResponse {
  status: number;
  statusText: string;
  probes: { type: string; message: string }[];
  detectionPatterns: { pattern: string; confidence?: number; type: string; description?: string }[];
}

/**
 * Sends a canary to a single provider
 */
async function sendCanaryToSingleProvider(
  provider: ApiProvider | ProviderOptions,
  customMessage?: string,
  repeat: number = 1,
) {
  const providerHash = generateShortProviderHash(provider);

  logger.debug(`Generated provider hash: ${providerHash}`);

  // Get canary payload from server
  const response = (await makeRequest('/task', 'POST', {
    task: 'generate-canary',
    hash: providerHash,
  })) as unknown as CanaryTokensResponse;

  if (!response || !response.canaryTokens || response.canaryTokens.length === 0) {
    throw new Error('Failed to generate canary tokens from server');
  }

  // Get provider ID for display
  const providerId =
    'id' in provider && typeof provider.id === 'function' ? provider.id() : provider.id;

  // Display canary tokens to user
  logger.info(
    `🔑 Generated ${response.canaryTokens.length} canary variations for provider: ${chalk.bold(providerId)}`,
  );

  // Pick canary tokens to send
  let canaryTokensToSend: string[] = [];

  // If user provided a custom message, use that
  if (customMessage) {
    canaryTokensToSend.push(customMessage);
  } else {
    // Otherwise use server-generated tokens
    // Use all tokens if repeat > 1, otherwise just use the first token
    canaryTokensToSend =
      repeat > 1
        ? response.canaryTokens.slice(0, Math.min(repeat, response.canaryTokens.length))
        : [response.canaryTokens[0]];
  }

  // Send the canary tokens to the provider
  if ('callApi' in provider) {
    for (const token of canaryTokensToSend) {
      logger.debug(
        `Sending canary token: ${token.substring(0, 30)}${token.length > 30 ? '...' : ''}`,
      );
      const _result = await provider.callApi(token);
    }

    logger.info(`🔑 Canary hash for future reference: ${chalk.bold(providerHash)}`);

    return {
      success: true,
      hash: providerHash,
      tokens: canaryTokensToSend,
    };
  } else {
    throw new Error('Provider does not support sending messages');
  }
}

/**
 * Sends a canary to all providers from config
 */
async function sendCanary(
  providers: (ApiProvider | ProviderOptions)[],
  customMessage?: string,
  repeat: number = 1,
) {
  if (providers.length === 0) {
    throw new Error('No providers found in config file');
  }

  logger.info(`Sending canaries to ${providers.length} providers from config...`);
  const results = [];
  for (const provider of providers) {
    const providerId =
      'id' in provider && typeof provider.id === 'function' ? provider.id() : provider.id;

    logger.info(`Sending canary to provider: ${chalk.bold(String(providerId))}`);
    try {
      const result = await sendCanaryToSingleProvider(provider, customMessage, repeat);
      results.push(result);
    } catch (error) {
      logger.error(`Failed to send canary to provider ${providerId}: ${(error as Error).message}`);
    }
  }
  return results;
}

/**
 * Checks if a specific provider has leaked the canary
 */
async function checkCanaryForSingleProvider(
  provider: ApiProvider | ProviderOptions,
  checkMode: string = 'auto',
) {
  const providerHash = generateShortProviderHash(provider);

  logger.debug(`Generated provider hash for checking: ${providerHash}`);

  // Get probe messages and detection patterns from server
  const response = (await makeRequest('/task', 'POST', {
    task: 'generate-canary-probes',
    hash: providerHash,
  })) as unknown as ProbesResponse;

  if (!response || !response.probes || !response.detectionPatterns) {
    throw new Error(
      `Failed to generate canary check probes from server: HTTP ${response.status} ${response.statusText} ${JSON.stringify(response)}`,
    );
  }

  // Select probes based on check mode
  let probesToUse: { type: string; message: string }[] = [];
  if (checkMode === 'auto') {
    // Use a mix of probe types in auto mode
    const probesByType: { [key: string]: { type: string; message: string }[] } = {};
    response.probes.forEach((probe: { type: string; message: string }) => {
      if (!probesByType[probe.type]) {
        probesByType[probe.type] = [];
      }
      probesByType[probe.type].push(probe);
    });

    // Take one of each type if available
    for (const type of ['direct', 'fact', 'semantic', 'general']) {
      if (probesByType[type] && probesByType[type].length > 0) {
        probesToUse.push(probesByType[type][0]);
      }
    }

    // If we don't have enough probes, add more
    if (probesToUse.length < 2 && response.probes.length > 0) {
      probesToUse = response.probes.slice(0, 2);
    }
  } else {
    // Filter probes by the requested type
    probesToUse = response.probes.filter(
      (probe: { type: string; message: string }) => probe.type === checkMode,
    );

    // If no probes of the requested type, use all probes
    if (probesToUse.length === 0) {
      probesToUse = response.probes;
    }

    // Limit to max 2 probes for efficiency
    probesToUse = probesToUse.slice(0, 2);
  }

  logger.info(`Using ${probesToUse.length} probe messages to check for canary leakage`);

  // Send probes to the provider and analyze responses locally
  if ('callApi' in provider) {
    const detectionPatterns = response.detectionPatterns;
    const detectedMatches: {
      pattern: string;
      confidence: number;
      context: string;
      description: string;
    }[] = [];
    let highestConfidence = 0;

    for (const probe of probesToUse) {
      logger.debug(`Sending probe: ${probe.message.substring(0, 50)}...`);
      const result = await provider.callApi(probe.message);

      // Extract the content from the response
      let responseContent = '';
      if (result && typeof result === 'object') {
        if ('message' in result) {
          responseContent = (result as any).message;
        } else if (
          'choices' in result &&
          Array.isArray((result as any).choices) &&
          (result as any).choices.length > 0
        ) {
          const choice = (result as any).choices[0];
          if (choice.message && choice.message.content) {
            responseContent = choice.message.content;
          }
        } else if ('content' in result) {
          responseContent = (result as any).content;
        } else if (typeof result === 'string') {
          responseContent = result as string;
        }
      } else if (typeof result === 'string') {
        responseContent = result;
      }

      logger.debug(`Got response (${responseContent.length} chars)`);

      // Check for matches against detection patterns
      for (const pattern of detectionPatterns) {
        const patternText = pattern.pattern;
        const confidence = pattern.confidence || 0.5;

        if (pattern.type === 'exact') {
          // Check for exact matches
          if (responseContent.includes(patternText)) {
            const position = responseContent.indexOf(patternText);
            const start = Math.max(0, position - 40);
            const end = Math.min(responseContent.length, position + patternText.length + 40);
            const context = responseContent.substring(start, end);

            detectedMatches.push({
              pattern: patternText,
              confidence,
              context,
              description: pattern.description || 'Exact match',
            });

            if (confidence > highestConfidence) {
              highestConfidence = confidence;
            }
          }
        } else if (pattern.type === 'partial') {
          // Check for partial matches (case insensitive)
          const lowerContent = responseContent.toLowerCase();
          const lowerPattern = patternText.toLowerCase();

          if (lowerContent.includes(lowerPattern)) {
            const position = lowerContent.indexOf(lowerPattern);
            const start = Math.max(0, position - 40);
            const end = Math.min(lowerContent.length, position + lowerPattern.length + 40);
            const context = responseContent.substring(start, end);

            detectedMatches.push({
              pattern: patternText,
              confidence: confidence * 0.8, // Slightly lower confidence for partial matches
              context,
              description: pattern.description || 'Partial match',
            });

            if (confidence * 0.8 > highestConfidence) {
              highestConfidence = confidence * 0.8;
            }
          }
        } else if (pattern.type === 'semantic') {
          // For semantic matches, we use a simplified approach
          // looking for key phrases or words that might indicate the semantic content
          const words = patternText.split(/\s+/).filter((w: string) => w.length > 4);
          for (const word of words) {
            if (responseContent.toLowerCase().includes(word.toLowerCase())) {
              const position = responseContent.toLowerCase().indexOf(word.toLowerCase());
              const start = Math.max(0, position - 40);
              const end = Math.min(responseContent.length, position + word.length + 40);
              const context = responseContent.substring(start, end);

              detectedMatches.push({
                pattern: word,
                confidence: confidence * 0.6, // Lower confidence for semantic matches
                context,
                description: pattern.description || 'Semantic match',
              });

              if (confidence * 0.6 > highestConfidence) {
                highestConfidence = confidence * 0.6;
              }

              // Only count one word per pattern
              break;
            }
          }
        }
      }
    }

    // Deduplicate matches
    const uniqueMatches: typeof detectedMatches = [];
    const seenPatterns = new Set<string>();

    for (const match of detectedMatches) {
      const key = `${match.pattern}:${match.context}`;
      if (!seenPatterns.has(key)) {
        seenPatterns.add(key);
        uniqueMatches.push(match);
      }
    }

    // Determine if canary was detected based on matches and confidence
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
    } else {
      // Get provider ID for display
      const providerId =
        'id' in provider && typeof provider.id === 'function' ? provider.id() : provider.id;

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
  } else {
    throw new Error('Provider does not support sending messages');
  }
}

/**
 * Checks if providers have leaked the canary
 */
async function checkCanary(
  providers: (ApiProvider | ProviderOptions)[],
  checkMode: string = 'auto',
) {
  if (providers.length === 0) {
    throw new Error('No providers found in config file');
  }

  logger.info(`Checking canaries for ${providers.length} providers from config...`);
  const results = [];
  for (const provider of providers) {
    const providerId =
      'id' in provider && typeof provider.id === 'function' ? provider.id() : provider.id;

    logger.info(`Checking canary for provider: ${chalk.bold(String(providerId))}`);
    try {
      const result = await checkCanaryForSingleProvider(provider, checkMode);
      results.push(result);
    } catch (error) {
      logger.error(
        `Failed to check canary for provider ${providerId}: ${(error as Error).message}`,
      );
    }
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
  $ promptfoo canary check --mode direct
    `,
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
        telemetry.record('command_used', { command: 'canary:send' });

        if (options.envPath) {
          setupEnv(options.envPath);
        }

        const repeat = Number.parseInt(options.repeat, 10);
        if (Number.isNaN(repeat) || repeat < 1) {
          throw new Error('The --repeat value must be a positive number');
        }

        // Load config and providers
        const { testSuite } = await resolveConfigs(
          { config: options.config || (defaultConfigPath ? [defaultConfigPath] : undefined) },
          defaultConfig,
        );

        const _result = await sendCanary(testSuite.providers, options.message, repeat);
        process.exit(0);
      } catch (error: unknown) {
        const err = error as Error;
        logger.error(`Error sending canary: ${err.message}`);
        process.exit(1);
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
        telemetry.record('command_used', { command: 'canary:check' });

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
          { config: options.config || (defaultConfigPath ? [defaultConfigPath] : undefined) },
          defaultConfig,
        );

        const result = await checkCanary(testSuite.providers, options.mode);

        // If any canary was detected, exit with code 1
        const anyDetection = result.some((r) => r && r.detected);
        process.exit(anyDetection ? 1 : 0);
      } catch (error: unknown) {
        const err = error as Error;
        logger.error(`Error checking canary: ${err.message}`);
        process.exit(1);
      }
    });

  return command;
}
