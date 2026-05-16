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
  CodeScanOutputFormat,
  CodeScanSeverity,
  countBySeverity,
  formatSeverity,
  getSeverityRank,
  type ScanResponse,
} from '../../types/codeScan';
import { formatDuration } from '../../util/formatDuration';
import { printBorder } from '../../util/index';
import { scanResponseToSarif } from '../util/sarif';

/**
 * Options for output display
 */
export interface OutputOptions {
  format: CodeScanOutputFormat;
  githubPr?: string;
}

/**
 * Options for spinner creation
 */
export interface SpinnerOptions {
  format: CodeScanOutputFormat;
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
  const showSpinner =
    !options.isWebUI &&
    options.format === CodeScanOutputFormat.TEXT &&
    options.logLevel !== 'debug';

  if (showSpinner) {
    return ora({ text: '', color: 'green' }).start();
  }

  return undefined;
}

function getReviewText(response: ScanResponse): string | undefined {
  const { comments, review } = response;
  if (review) {
    return review;
  }
  return comments?.find((comment) => comment.severity === CodeScanSeverity.NONE)?.finding;
}

function getSortedIssues(response: ScanResponse) {
  const validSeverities: CodeScanSeverity[] = [
    CodeScanSeverity.CRITICAL,
    CodeScanSeverity.HIGH,
    CodeScanSeverity.MEDIUM,
    CodeScanSeverity.LOW,
  ];
  return [...(response.comments || [])]
    .filter((comment) => comment.severity && validSeverities.includes(comment.severity))
    .sort((a, b) => {
      const rankA = a.severity ? getSeverityRank(a.severity) : 0;
      const rankB = b.severity ? getSeverityRank(b.severity) : 0;
      return rankB - rankA;
    });
}

function displayTextSummary(response: ScanResponse, duration: number) {
  const severityCounts = countBySeverity(response.comments || []);
  printBorder();
  logger.info(`${chalk.green('✓')} Scan complete (${formatDuration(duration / 1000)})`);
  if (severityCounts.total > 0) {
    logger.info(
      chalk.yellow(`⚠ Found ${severityCounts.total} issue${severityCounts.total === 1 ? '' : 's'}`),
    );
  }
  printBorder();
  return severityCounts;
}

function displayReviewText(reviewText: string | undefined) {
  if (!reviewText) {
    return;
  }
  logger.info('');
  logger.info(reviewText);
  logger.info('');
  printBorder();
}

function displayIssueDetails(response: ScanResponse, githubPr?: string) {
  const sortedComments = getSortedIssues(response);
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

    if (i < sortedComments.length - 1) {
      logger.info('');
      logger.info(chalk.gray('─'.repeat(TERMINAL_MAX_WIDTH)));
      logger.info('');
    }
  }
  printBorder();

  if (githubPr) {
    logger.info(`» Comments posted to PR: ${chalk.cyan(githubPr)}`);
    printBorder();
  }
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
  if (options.format === CodeScanOutputFormat.JSON) {
    console.log(JSON.stringify(response, null, 2));
    return;
  }
  if (options.format === CodeScanOutputFormat.SARIF) {
    console.log(JSON.stringify(scanResponseToSarif(response), null, 2));
    return;
  }

  const severityCounts = displayTextSummary(response, duration);
  displayReviewText(getReviewText(response));
  if (severityCounts.total > 0) {
    displayIssueDetails(response, options.githubPr);
  }
}
