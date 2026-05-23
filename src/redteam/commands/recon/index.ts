import * as fs from 'fs';
import * as path from 'path';

import confirm from '@inquirer/confirm';
import chalk from 'chalk';
import opener from 'opener';
import ora from 'ora';
import { getDefaultPort, getLocalAppUrl } from '../../../constants';
import logger from '../../../logger';
import { startServer } from '../../../server/server';
import { writePromptfooConfig } from '../../../util/config/writer';
import { BrowserBehavior, checkServerRunning } from '../../../util/server';
import { buildRedteamConfig } from './config';
import { displayResults } from './output';
import { buildPendingConfig, createReconHandoffToken, writePendingReconConfig } from './pending';
import { buildReconPrompt } from './prompt';
import {
  createAnthropicReconProvider,
  createOpenAIReconProvider,
  type ReconProgressCallback,
  selectProvider,
} from './providers';
import { createScratchpad } from './scratchpad';
import { prepareReconTarget } from './target';

import type { ReconResult } from '../../../validators/recon';
import type { ReconOptions } from './types';

const SERVER_START_TIMEOUT_MS = 10_000;
const SERVER_START_POLL_MS = 250;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pluralize(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}

/**
 * Opens the web UI with the recon source parameter
 */
async function openBrowserWithRecon(handoffToken: string): Promise<void> {
  const url = getLocalAppUrl('/redteam/setup', { source: 'recon', token: handoffToken });

  try {
    await opener(url);
    logger.info(`\n${chalk.green('✨')} Opening browser: ${chalk.cyan(url)}`);
  } catch (error) {
    logger.debug('Failed to open browser automatically', { error });
    logger.info(`\nOpen this URL in your browser: ${chalk.cyan(url)}`);
  }
}

async function waitForServer(port: number, getServerError: () => unknown): Promise<void> {
  const deadline = Date.now() + SERVER_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const serverError = getServerError();
    if (serverError) {
      throw serverError;
    }

    if (await checkServerRunning(port)) {
      return;
    }

    await delay(SERVER_START_POLL_MS);
  }

  throw new Error(`Timed out waiting for promptfoo server on port ${port}`);
}

async function openReconHandoff(handoffToken: string): Promise<void> {
  const port = getDefaultPort();
  if (await checkServerRunning(port)) {
    await openBrowserWithRecon(handoffToken);
    return;
  }

  let serverError: unknown;
  let handoffOpened = false;
  const serverPromise = startServer(port, BrowserBehavior.SKIP).catch((error: unknown) => {
    serverError = error;
    if (handoffOpened) {
      logger.error(
        `Local promptfoo server stopped unexpectedly: ${error instanceof Error ? error.message : error}`,
      );
    }
  });
  void serverPromise;

  await waitForServer(port, () => serverError);
  await openBrowserWithRecon(handoffToken);
  handoffOpened = true;
  logger.info(chalk.dim('Press Ctrl+C to stop the local promptfoo server when you are done.'));
  await serverPromise;
}

/**
 * Main entry point for the recon command
 */
export async function doRecon(options: ReconOptions): Promise<ReconResult> {
  const directory = path.resolve(options.dir || process.cwd());

  // Validate directory
  if (!fs.existsSync(directory)) {
    throw new Error(`Directory not found: ${directory}`);
  }
  if (!fs.statSync(directory).isDirectory()) {
    throw new Error(`Path is not a directory: ${directory}`);
  }

  logger.info(`\nReconnaissance target: ${chalk.cyan(directory)}`);
  logger.info(chalk.dim('Agent can read files and search documentation in a read-only run\n'));

  // Create an isolated temporary working directory and always remove it afterward.
  const scratchpad = createScratchpad();
  let spinner: ReturnType<typeof ora> | undefined;

  try {
    const reconTarget = prepareReconTarget(directory, scratchpad.dir, options.exclude);
    logger.info(
      chalk.dim(
        `Prepared filtered analysis snapshot with ${reconTarget.copiedFiles} ${pluralize(
          reconTarget.copiedFiles,
          'file',
        )} (${reconTarget.skippedEntries} ${pluralize(reconTarget.skippedEntries, 'entry')} excluded).`,
      ),
    );

    // Select provider based on available authentication or a forced choice.
    const providerChoice = selectProvider(options.provider);
    logger.info(`Provider: ${chalk.cyan(providerChoice.type)} (${providerChoice.model})`);

    // Create the appropriate provider with progress callback
    const modelOverride = options.model || providerChoice.model;

    // Run analysis with spinner
    spinner = ora('Analyzing codebase...').start();

    // Progress callback updates the spinner text
    const onProgress: ReconProgressCallback = (event) => {
      spinner!.text = event.message;
    };

    const provider =
      providerChoice.type === 'openai'
        ? await createOpenAIReconProvider(
            reconTarget.directory,
            scratchpad,
            modelOverride,
            onProgress,
          )
        : await createAnthropicReconProvider(
            reconTarget.directory,
            scratchpad,
            modelOverride,
            onProgress,
          );

    // Build the analysis prompt
    const prompt = buildReconPrompt(reconTarget.directory, scratchpad.path, options.exclude);

    const result = await provider.analyze(reconTarget.directory, prompt);
    spinner.succeed('Analysis complete');

    // Display summary of findings
    displayResults(result, options.verbose);

    // Confirm before writing config file
    const outputPath = options.output || 'promptfooconfig.yaml';
    if (!options.yes) {
      const confirmed = await confirm({
        message: `Write config to ${outputPath}?`,
        default: true,
      });
      if (!confirmed) {
        logger.info('Aborted. No config file written.');
        return result;
      }
    }

    // Generate and write the config (pass directory to include metadata for UI import)
    const config = buildRedteamConfig(result, directory);
    writePromptfooConfig(config, outputPath, [
      'Auto-generated by: promptfoo redteam recon',
      `Scanned directory: ${directory}`,
      `Generated: ${new Date().toISOString()}`,
      '',
      'Review this config and configure your target before running:',
      '  promptfoo redteam run',
    ]);

    logger.info(`\nConfig written to ${chalk.green(outputPath)}`);

    // Open browser if not disabled
    if (options.open === false) {
      logger.info(`\n${chalk.yellow('Next steps:')}`);
      logger.info('  1. Configure your target endpoint in the config');
      logger.info('  2. Review the discovered application context');
      logger.info(`  3. Run: ${chalk.cyan('promptfoo redteam run')}`);
    } else {
      const handoffToken = createReconHandoffToken();
      const pendingConfig = buildPendingConfig(config, result, directory, handoffToken);
      writePendingReconConfig(pendingConfig);
      await openReconHandoff(handoffToken);
      logger.info('');
      logger.info(chalk.dim('In the browser:'));
      logger.info(chalk.dim('  1. Review the populated application context'));
      logger.info(chalk.dim('  2. Configure your target endpoint'));
      logger.info(chalk.dim('  3. Click "Run Red Team" when ready'));
    }

    return result;
  } catch (error) {
    // Fail the spinner on error to provide clear feedback
    if (spinner) {
      spinner.fail('Analysis failed');
    }
    throw error;
  } finally {
    // Always clean up temporary analysis workspace artifacts.
    scratchpad.cleanup();
  }
}
