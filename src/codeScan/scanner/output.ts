/**
 * Output Formatting and Display
 *
 * Handles formatting and displaying scan results in various formats (JSON, pretty-print).
 */

import chalk from 'chalk';
import ora from 'ora';
import { TERMINAL_MAX_WIDTH } from '../../constants';
import logger from '../../logger';
import {
  CodeScanSeverity,
  countBySeverity,
  formatSeverity,
  getSeverityRank,
  type ScanResponse,
} from '../../types/codeScan';
import { formatDuration } from '../../util/formatDuration';
import { printBorder } from '../../util/index';

/**
 * Options for output display
 */
export interface OutputOptions {
  json: boolean;
  githubPr?: string;
}

/**
 * Options for spinner creation
 */
export interface SpinnerOptions {
  json: boolean;
  isWebUI: boolean;
  logLevel: string;
}

/**
 * Create spinner if appropriate for the current environment
 *
 * @param options - Options for spinner creation
 * @returns Spinner instance or undefined if spinner should not be shown
 */
export function createSpinner(options: SpinnerOptions): ReturnType<typeof ora> | undefined {
  const showSpinner = !options.isWebUI && !options.json && options.logLevel !== 'debug';

  if (showSpinner) {
    return ora({ text: '', color: 'green' }).start();
  }

  return undefined;
}

/**
 * Display scan results in the appropriate format
 *
 * @param response - Scan response from server
 * @param duration - Duration of scan in milliseconds
 * @param options - Output options
 */
export function displayScanResults(
  response: ScanResponse,
  duration: number,
  options: OutputOptions,
): void {
  if (options.json) {
    // Output full scan response to stdout for programmatic consumption
    console.log(JSON.stringify(response, null, 2));
  } else {
    // Pretty-print results for human consumption
    const { comments, review } = response;
    const severityCounts = countBySeverity(comments || []);

    // 1. Completion message and issue summary
    printBorder();
    logger.info(`${chalk.green('✓')} Scan complete (${formatDuration(duration / 1000)})`);
    if (severityCounts.total > 0) {
      logger.info(
        chalk.yellow(
          `⚠ Found ${severityCounts.total} issue${severityCounts.total === 1 ? '' : 's'}`,
        ),
      );
    }
    printBorder();

    // 3. Review summary - shown even when no issues
    // If no review field, check for severity="none" comment to use as review
    let reviewText = review;
    if (!reviewText && comments && comments.length > 0) {
      const noneComment = comments.find((c) => c.severity === CodeScanSeverity.NONE);
      if (noneComment) {
        reviewText = noneComment.finding;
      }
    }

    if (reviewText) {
      logger.info('');
      logger.info(reviewText);
      logger.info('');
      printBorder();
    }

    // 4. Detailed findings (only show issues with valid severity)
    if (severityCounts.total > 0) {
      const validSeverities: CodeScanSeverity[] = [
        CodeScanSeverity.CRITICAL,
        CodeScanSeverity.HIGH,
        CodeScanSeverity.MEDIUM,
        CodeScanSeverity.LOW,
      ];
      const issuesWithSeverity = (comments || []).filter(
        (c) => c.severity && validSeverities.includes(c.severity),
      );

      // Sort by severity (descending)
      const sortedComments = [...issuesWithSeverity].sort((a, b) => {
        const rankA = a.severity ? getSeverityRank(a.severity) : 0;
        const rankB = b.severity ? getSeverityRank(b.severity) : 0;
        return rankB - rankA;
      });

      logger.info('');
      for (let i = 0; i < sortedComments.length; i++) {
        const comment = sortedComments[i];
        const severity = formatSeverity(comment.severity);
        const location = comment.line ? `${comment.file}:${comment.line}` : comment.file || '';

        logger.info(`${severity} ${chalk.gray(location)}`);
        logger.info('');
        logger.info(comment.finding);

        if (comment.fix) {
          logger.info('');
          logger.info(chalk.bold('Suggested Fix:'));
          logger.info(comment.fix);
        }

        if (comment.aiAgentPrompt) {
          logger.info('');
          logger.info(chalk.bold('AI Agent Prompt:'));
          logger.info(comment.aiAgentPrompt);
        }

        // Add separator between comments (but not after the last one)
        if (i < sortedComments.length - 1) {
          logger.info('');
          logger.info(chalk.gray('─'.repeat(TERMINAL_MAX_WIDTH)));
          logger.info('');
        }
      }
      printBorder();

      // 5. Next steps (only if there are issues)
      if (options.githubPr) {
        logger.info(`» Comments posted to PR: ${chalk.cyan(options.githubPr)}`);
        printBorder();
      }
    }
  }
}
