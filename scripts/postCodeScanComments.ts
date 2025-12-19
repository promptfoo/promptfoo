/**
 * Posts code scan comments to a PR after the scan workflow completes.
 *
 * This script is executed by the workflow_run workflow to post comments
 * with elevated permissions (works for fork PRs).
 *
 * Usage: npx tsx scripts/postCodeScanComments.ts
 *
 * Environment variables:
 *   GITHUB_TOKEN - GitHub token with pull-requests:write permission
 *   SCAN_RESULTS_PATH - Path to scan results JSON file (default: scan-results.json)
 *
 * @module scripts/postCodeScanComments
 */

import fs from 'node:fs';

import { Octokit } from '@octokit/rest';

interface Comment {
  file?: string;
  line?: number;
  startLine?: number;
  finding: string;
  fix?: string;
  severity?: string;
  aiAgentPrompt?: string;
}

interface ScanResponse {
  comments: Comment[];
  review?: string;
}

interface PrContext {
  owner: string;
  repo: string;
  number: number;
  sha: string;
}

interface ScanData {
  scanResponse: ScanResponse;
  prContext: PrContext;
  minimumSeverity: string;
}

/**
 * Sanitizes content to prevent potential security issues.
 * Removes or escapes potentially dangerous patterns while preserving markdown.
 */
function sanitizeContent(content: string): string {
  if (!content) {
    return '';
  }

  // Remove dangerous URL schemes that could be used for XSS or code execution
  // Handles: javascript:, vbscript:, and data: (except safe image formats)
  let sanitized = content.replace(/javascript:/gi, 'blocked:');
  sanitized = sanitized.replace(/vbscript:/gi, 'blocked:');
  sanitized = sanitized.replace(/data:(?!image\/(png|jpeg|gif|webp|svg\+xml))/gi, 'blocked:');

  // Limit content length to prevent abuse
  const maxLength = 10000;
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + '\n\n... (content truncated)';
  }

  return sanitized;
}

/**
 * Formats severity level with emoji indicator.
 */
function formatSeverity(severity: string | undefined): string {
  if (!severity) {
    return '';
  }

  const severityMap: Record<string, string> = {
    critical: '🔴 **Critical** ',
    high: '🟠 **High** ',
    medium: '🟡 **Medium** ',
    low: '🔵 **Low** ',
  };

  return severityMap[severity.toLowerCase()] || '';
}

/**
 * Builds comment body from a comment object.
 */
function buildCommentBody(comment: Comment): string {
  let body = '';

  if (comment.severity) {
    body += formatSeverity(comment.severity);
  }

  body += sanitizeContent(comment.finding);

  if (comment.fix) {
    body += `\n\n<details>\n<summary>💡 Suggested Fix</summary>\n\n${sanitizeContent(comment.fix)}\n</details>`;
  }

  if (comment.aiAgentPrompt) {
    body += `\n\n<details>\n<summary>🤖 AI Agent Prompt</summary>\n\n${sanitizeContent(comment.aiAgentPrompt)}\n</details>`;
  }

  return body;
}

/**
 * Logs info message to console.
 */
function info(message: string): void {
  console.log(`[INFO] ${message}`);
}

/**
 * Logs warning message to console.
 */
function warn(message: string): void {
  console.warn(`[WARN] ${message}`);
}

/**
 * Posts code scan comments to a GitHub PR.
 */
async function postCodeScanComments(): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable is required');
  }

  const resultsPath = process.env.SCAN_RESULTS_PATH || 'scan-results.json';

  // Read scan results
  let scanData: ScanData;
  try {
    const content = fs.readFileSync(resultsPath, 'utf8');
    scanData = JSON.parse(content) as ScanData;
  } catch {
    info('No scan results found or failed to parse');
    return;
  }

  const { scanResponse, prContext } = scanData;
  const { comments, review } = scanResponse;

  if (!comments || comments.length === 0) {
    info('No findings to post');
    return;
  }

  info(`Posting ${comments.length} findings to PR #${prContext.number}`);

  const octokit = new Octokit({ auth: token });

  // Track failures for accurate reporting
  let failureCount = 0;

  // Separate line-specific comments from general comments
  const lineComments = comments.filter((c) => c.file && c.line);
  const generalComments = comments.filter((c) => !c.file || !c.line);

  // Post review with line-specific comments
  if (lineComments.length > 0 || review) {
    try {
      const reviewComments = lineComments.map((c) => ({
        path: c.file!,
        line: c.line!,
        start_line: c.startLine && c.line && c.startLine < c.line ? c.startLine : undefined,
        side: 'RIGHT' as const,
        start_side: c.startLine && c.line && c.startLine < c.line ? ('RIGHT' as const) : undefined,
        body: buildCommentBody(c),
      }));

      await octokit.pulls.createReview({
        owner: prContext.owner,
        repo: prContext.repo,
        pull_number: prContext.number,
        event: 'COMMENT',
        body: review ? sanitizeContent(review) : undefined,
        comments: reviewComments.length > 0 ? reviewComments : undefined,
      });

      info(`Posted review with ${reviewComments.length} inline comments`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warn(`Failed to post inline comments: ${message}`);
      info('Falling back to summary comment...');
      failureCount++;

      // Fallback: post as summary comment
      const summaryBody = lineComments
        .map((c) => {
          const lineRange =
            c.startLine && c.line && c.startLine !== c.line
              ? `${c.file}:${c.startLine}-${c.line}`
              : `${c.file}:${c.line}`;

          return `**${lineRange}**\n\n${buildCommentBody(c)}`;
        })
        .join('\n\n---\n\n');

      try {
        await octokit.issues.createComment({
          owner: prContext.owner,
          repo: prContext.repo,
          issue_number: prContext.number,
          body: `## 🔍 LLM Security Scan Results\n\n${summaryBody}`,
        });
        info('Posted summary comment');
      } catch (fallbackError) {
        const fallbackMessage =
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        warn(`Failed to post summary comment: ${fallbackMessage}`);
        failureCount++;
      }
    }
  }

  // Post general comments
  for (const comment of generalComments) {
    try {
      await octokit.issues.createComment({
        owner: prContext.owner,
        repo: prContext.repo,
        issue_number: prContext.number,
        body: buildCommentBody(comment),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warn(`Failed to post general comment: ${message}`);
      failureCount++;
    }
  }

  // Report accurate completion status
  const totalComments = lineComments.length + generalComments.length;
  if (failureCount === 0) {
    info(`All ${totalComments} comments posted successfully`);
  } else {
    info(
      `Comment posting completed with ${failureCount} failure(s) out of ${totalComments} comments`,
    );
  }
}

// Run when executed directly
postCodeScanComments().catch((error) => {
  console.error('Failed to post code scan comments:', error);
  process.exit(1);
});
