import chalk from 'chalk';
import type { Command } from 'commander';
import dedent from 'dedent';
import * as fs from 'fs';
import yaml from 'js-yaml';
import { z } from 'zod';

import cliState from '../../cliState';
import logger, { setLogLevel } from '../../logger';
import telemetry from '../../telemetry';
import type {
  RedteamFileConfig,
  UnifiedConfig,
} from '../../types';
import {
  isRunningUnderNpx,
  printBorder,
  setupEnv,
} from '../../util';
import { resolveConfigs } from '../../util/config/load';
import { writePromptfooConfig } from '../../util/config/manage';
import { getRemoteGenerationUrl } from '../remoteGeneration';

// Schema for the discover command options
const RedteamDiscoverOptionsSchema = z.object({
  config: z.string().optional(),
  previewOnly: z.boolean().optional(),
  preview: z.boolean().optional(),
  force: z.boolean().optional(),
  verbose: z.boolean().optional(),
  envFile: z.string().optional(),
});

type RedteamDiscoverOptions = z.infer<typeof RedteamDiscoverOptionsSchema>;

/**
 * Implements the target discovery functionality.
 * This function always calls the remote server to discover information about the target app.
 */
export async function doTargetDiscovery(
  options: Partial<RedteamDiscoverOptions>,
): Promise<{ configPath: string; discoveryOutput: any } | null> {
  const configPath = options.config || 'promptfooconfig.yaml';
  
  if (!fs.existsSync(configPath)) {
    logger.info(
      chalk.red(
        `\nConfiguration file not found: ${configPath} - run ${chalk.yellow.bold(
          isRunningUnderNpx() ? 'npx promptfoo redteam init' : 'promptfoo redteam init',
        )} first`,
      ),
    );
    return null;
  }
  
  // Load the existing configuration
  const configContent = fs.readFileSync(configPath, 'utf8');
  const config = yaml.load(configContent) as Partial<UnifiedConfig>;
  
  // Check if we already have discovery output and not forcing rediscovery
  if (
    !options.force && 
    config.redteam?.targetDiscoveryOutput && 
    Object.keys(config.redteam?.targetDiscoveryOutput).length > 0
  ) {
    logger.info(
      chalk.yellow(
        `\nTarget discovery information already exists. Use --force to rediscover.`,
      ),
    );
    return { configPath, discoveryOutput: config.redteam?.targetDiscoveryOutput };
  }
  
  // Extract the necessary information from the config
  const resolved = await resolveConfigs({ config: [configPath] }, {});
  const redteamConfig = resolved.config.redteam || {};
  
  // Get the target configuration - this is our provider for the purpose discovery task
  let targetConfig: any = null;
  
  // Look at the raw config file first since it preserves the 'targets' property better
  if (config.targets && Array.isArray(config.targets) && config.targets.length > 0) {
    targetConfig = config.targets[0]; // Use the first target
    logger.debug(`Using target from config file: ${targetConfig.id}`);
  }
  // Last resort - check if there are providers we can use
  else if (resolved.testSuite.providers && resolved.testSuite.providers.length > 0) {
    const providerId = redteamConfig.provider;
    const providerConfig = resolved.testSuite.providers.find(
      provider => typeof provider === 'object' && provider.id === providerId
    );
    
    if (providerConfig) {
      targetConfig = providerConfig;
      logger.debug(`Using provider as target: ${providerId}`);
    }
  }
  
  if (!targetConfig) {
    logger.error(
      chalk.red(
        `\nNo target configuration found. Your config.yaml should have either a 'targets' array or 'providers' with a matching 'redteam.provider'.`,
      ),
    );
    return null;
  }
  
  // Prepare the provider configuration in the format expected by the server
  const providerConfig = {
    id: targetConfig.id || '',
    config: targetConfig.config || {},
    label: targetConfig.label || '',
  };
  
  logger.debug(`Using target/provider: ${providerConfig.id}`);
  
  // Validate the provider config before sending
  if (!providerConfig.id) {
    logger.warn(`Provider ID is empty. This may cause issues with the server.`);
  }
  
  // Log what we're sending (but hide sensitive config details)
  logger.debug(`Sending provider config to server: ${JSON.stringify({
    id: providerConfig.id,
    config: { ...(providerConfig.config || {}) },
    label: providerConfig.label,
  }, null, 2)}`);
  
  // Always use remote discovery
  logger.info('Discovering target application information using remote server...');
  
  // Set remote to true to ensure we use the remote endpoint
  cliState.remote = true;
  
  try {
    // Get the remote API URL
    const apiUrl = getRemoteGenerationUrl();
    
    logger.debug(`Using remote API endpoint: ${apiUrl}`);
    
    // Looking at app/src/utils/api/task.ts, the API expects:
    // { task: 'app-purpose-discovery', providerConfig: Record<string, any>, existingPurpose?: string }
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        task: 'app-purpose-discovery',
        providerConfig, // This is now correctly formatted
        existingPurpose: redteamConfig.purpose || '',
      }),
    });
    
    logger.debug(`Sent request to server with target: ${providerConfig.id}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      try {
        // Try to parse the error as JSON for better error messages
        const errorJson = JSON.parse(errorText);
        logger.debug(`Server error details: ${JSON.stringify(errorJson, null, 2)}`);
      } catch {
        // If it's not JSON, just log the raw text
        logger.debug(`Server error response: ${errorText}`);
      }
      throw new Error(`Remote API call failed: ${errorText}`);
    }
    
    const discoveryResult = await response.json();
    
    // Display the discovery results
    printBorder();
    logger.info(chalk.green('Target Discovery Results (from remote server):'));
    logger.info(`\nDiscovered Purpose: ${chalk.cyan(discoveryResult.discoveredPurpose)}`);
    logger.info(`\nEnhanced Purpose: ${chalk.cyan(discoveryResult.enhancedPurpose)}`);
    
    if (redteamConfig.purpose) {
      logger.info(`\nOriginal Purpose: ${chalk.yellow(redteamConfig.purpose)}`);
      
      // Compare and highlight differences
      if (discoveryResult.enhancedPurpose !== redteamConfig.purpose) {
        logger.info(
          chalk.magenta('\nThe enhanced purpose provides additional details not in the original purpose.')
        );
      }
    }
    printBorder();
    
    // If not preview-only, update the config file
    if (options.previewOnly) {
      logger.info(
        chalk.blue('\nRunning in preview mode - no changes were made to your configuration file.')
      );
      
      const commandPrefix = isRunningUnderNpx() ? 'npx promptfoo' : 'promptfoo';
      logger.info(
        chalk.blue(
          `\nTo save these discovery results, run without the --preview flag:\n${chalk.bold(`${commandPrefix} redteam discover -c ${configPath}`)}`
        )
      );
    } else {
      const updatedConfig = { ...config };
      
      if (!updatedConfig.redteam) {
        updatedConfig.redteam = {} as RedteamFileConfig;
      }
      
      updatedConfig.redteam.targetDiscoveryOutput = discoveryResult;
      
      // Suggest updating the purpose if it's different
      if (
        discoveryResult.enhancedPurpose && 
        (!updatedConfig.redteam.purpose || options.force)
      ) {
        updatedConfig.redteam.purpose = discoveryResult.enhancedPurpose;
        logger.info(
          chalk.green('\nUpdated the system purpose with the enhanced discovered purpose.')
        );
      }
      
      writePromptfooConfig(updatedConfig, configPath);
      logger.info(
        chalk.green(`\nUpdated ${configPath} with target discovery information.`)
      );
      
      const commandPrefix = isRunningUnderNpx() ? 'npx promptfoo' : 'promptfoo';
      logger.info(
        '\n' +
        chalk.blue(
          `Next step: Run ${chalk.bold(`${commandPrefix} redteam generate -c ${configPath}`)} to generate tests.`
        )
      );
    }
    
    return { configPath, discoveryOutput: discoveryResult };
  } catch (error) {
    logger.error(
      `Failed to discover target information from remote server: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

/**
 * Registers the discover command with the CLI.
 */
export function redteamDiscoverCommand(program: Command) {
  program
    .command('discover')
    .description(
      dedent`
        ${chalk.cyan('Discover information')} about the target application by analyzing it remotely.
        
        This command communicates with the target application through our remote server to automatically discover:
        - Purpose and capabilities
        - Limitations and boundaries
        - User types and content restrictions
        
        The discovered information enhances red team test generation by creating
        more relevant and targeted tests for your specific application.
      `,
    )
    .option('-c, --config [path]', 'Path to configuration file. Defaults to promptfooconfig.yaml')
    .option('--preview', 'Preview discovery results without modifying the config file', false)
    .option('--force', 'Force rediscovery even if information already exists', false)
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .option('--verbose', 'Show debug logs', false)
    .action(async (opts: Partial<RedteamDiscoverOptions>) => {
      setupEnv(opts.envFile);
      
      telemetry.record('command_used', {
        name: 'redteam discover',
      });
      
      if (opts.verbose) {
        setLogLevel('debug');
      }
      
      // Always use remote for discovery
      cliState.remote = true;
      
      logger.debug('Remote discovery enabled');
      
      try {
        const validatedOpts = RedteamDiscoverOptionsSchema.parse({
          ...opts,
          previewOnly: opts.preview,
        });
        
        await doTargetDiscovery(validatedOpts);
      } catch (error) {
        if (error instanceof z.ZodError) {
          logger.error('Invalid options:');
          error.errors.forEach((err: z.ZodIssue) => {
            logger.error(`  ${err.path.join('.')}: ${err.message}`);
          });
        } else {
          logger.error(
            `An unexpected error occurred during target discovery: ${error instanceof Error ? error.message : String(error)}\n${
              error instanceof Error ? error.stack : ''
            }`,
          );
        }
        process.exitCode = 1;
      }
    });
} 