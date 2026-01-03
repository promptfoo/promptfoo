/**
 * CLI output formatting for recon results.
 *
 * This module handles displaying reconnaissance results to the console
 * in a structured, readable format.
 */

import chalk from 'chalk';
import logger from '../../../logger';
import type { ReconResult } from './types';

/**
 * Displays the reconnaissance results to the console in a formatted layout.
 *
 * @param result - The reconnaissance result to display
 * @param verbose - If true, shows additional details like file paths for tools
 */
export function displayResults(result: ReconResult, verbose?: boolean): void {
  logger.info(chalk.bold.green('\n=== Reconnaissance Results ===\n'));

  if (result.purpose) {
    logger.info(chalk.bold('Purpose:'));
    logger.info(`  ${result.purpose}\n`);
  }

  if (result.features) {
    logger.info(chalk.bold('Features:'));
    logger.info(`  ${result.features}\n`);
  }

  if (result.industry) {
    logger.info(chalk.bold('Industry:'));
    logger.info(`  ${result.industry}\n`);
  }

  if (result.systemPrompt) {
    logger.info(chalk.bold('System Prompt Found:'));
    const truncated =
      result.systemPrompt.length > 200
        ? `${result.systemPrompt.substring(0, 200)}...`
        : result.systemPrompt;
    logger.info(chalk.dim(`  ${truncated}`));
    logger.info('');
  }

  if (result.hasAccessTo) {
    logger.info(chalk.bold('Has Access To:'));
    logger.info(`  ${result.hasAccessTo}\n`);
  }

  if (result.discoveredTools && result.discoveredTools.length > 0) {
    logger.info(chalk.bold(`Discovered Tools (${result.discoveredTools.length}):`));
    for (const tool of result.discoveredTools) {
      logger.info(`  - ${tool.name}: ${tool.description}`);
      if (tool.file && verbose) {
        logger.info(chalk.dim(`    File: ${tool.file}`));
      }
    }
    logger.info('');
  }

  if (result.suggestedPlugins && result.suggestedPlugins.length > 0) {
    logger.info(chalk.bold('Suggested Plugins:'));
    logger.info(`  ${result.suggestedPlugins.join(', ')}\n`);
  }

  if (result.entities && result.entities.length > 0) {
    logger.info(chalk.bold('Entities:'));
    logger.info(`  ${result.entities.join(', ')}\n`);
  }

  if (result.securityNotes && result.securityNotes.length > 0) {
    logger.info(chalk.bold.yellow('Security Notes:'));
    for (const note of result.securityNotes) {
      logger.info(`  - ${note}`);
    }
    logger.info('');
  }

  if (verbose && result.keyFiles && result.keyFiles.length > 0) {
    logger.info(chalk.bold('Key Files Analyzed:'));
    for (const file of result.keyFiles) {
      logger.info(`  ${file}`);
    }
  }
}
