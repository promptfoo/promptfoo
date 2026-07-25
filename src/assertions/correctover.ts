import { execFile } from 'child_process';
import { promisify } from 'util';
import logger from '../logger';
import type { AssertionParams, GradingResult } from '../types/index';
import { safeJsonStringify } from '../util';

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;
const MAX_DETAIL_LENGTH = 200;

/**
 * Correctover CCS (Call Shield) assertion handler.
 *
 * Validates MCP/AI agent tool calls against Correctover's runtime
 * call verification rules. Scans both the output text and recorded
 * tool-call payloads from agent providers.
 *
 * Usage in promptfoo config:
 * ```yaml
 * assertions:
 *   - type: correctover
 *     value: /path/to/ccs-rules.yaml   # optional rules config
 * ```
 *
 * Requires: pip install correctover-ccs
 */

/**
 * Redact potentially sensitive content from scanner output.
 * Truncates long details and removes patterns that look like credentials.
 */
function redactDetail(detail: string): string {
  // Truncate to avoid leaking large payloads
  let redacted = detail.length > MAX_DETAIL_LENGTH
    ? detail.substring(0, MAX_DETAIL_LENGTH) + '...[truncated]'
    : detail;

  // Redact patterns that look like secrets
  const sensitivePatterns = [
    /(?:sk-|ghp_|gho_|xox[bp]-|AKIA|ssh-(?:rsa|ed25519))[\w-]+/gi,
    /(?:password|secret|token|api[_-]?key)\s*[=:]\s*\S+/gi,
    /-----BEGIN[\s\S]*?-----END/gi,
  ];
  for (const pattern of sensitivePatterns) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  return redacted;
}

/**
 * Extract tool-call payloads from provider response metadata.
 * Agent providers (claude-agent-sdk, n8n, etc.) store executed
 * tool calls in metadata.toolCalls rather than in output.
 */
function extractToolCallData(providerResponse: any): string {
  const parts: string[] = [];

  // Include the main output
  if (typeof providerResponse.output === 'string') {
    parts.push(providerResponse.output);
  } else if (providerResponse.output) {
    parts.push(safeJsonStringify(providerResponse.output));
  }

  // Include tool-call metadata from agent providers
  const metadata = providerResponse.metadata;
  if (metadata) {
    if (Array.isArray(metadata.toolCalls) && metadata.toolCalls.length > 0) {
      parts.push(`[toolCalls] ${safeJsonStringify(metadata.toolCalls)}`);
    }
    // Also check for nested tool call fields used by various providers
    if (metadata.tool_calls) {
      parts.push(`[tool_calls] ${safeJsonStringify(metadata.tool_calls)}`);
    }
    if (metadata.actions) {
      parts.push(`[actions] ${safeJsonStringify(metadata.actions)}`);
    }
  }

  return parts.join('\n');
}

export const handleCorrectover = async ({
  assertion,
  inverse,
  providerResponse,
}: AssertionParams): Promise<GradingResult> => {
  const input = extractToolCallData(providerResponse);

  if (!input || input === '""') {
    return {
      pass: !inverse,
      score: inverse ? 0 : 1,
      reason: inverse
        ? 'Expected CCS to find issues, but no output or tool calls to scan'
        : 'No output or tool calls to scan with Correctover CCS',
      assertion,
    };
  }

  // Build CCS command with optional rules file from assertion.value
  const rulesPath = typeof assertion.value === 'string' ? assertion.value.trim() : '';
  const args = ['scan', '--format', 'json', '--input', '-'];
  if (rulesPath) {
    args.push('--rules', rulesPath);
  }

  try {
    let stdout: string;
    try {
      const result = await execFileAsync('ccs', args, {
        input,
        encoding: 'utf-8',
        timeout: DEFAULT_TIMEOUT_MS,
        maxBuffer: DEFAULT_MAX_BUFFER,
      });
      stdout = result.stdout;
    } catch (execError: any) {
      const stderr = execError.stderr || '';
      const code = execError.code;

      // CLI not installed → explicit failure (not silent pass)
      if (stderr.includes('command not found') ||
          stderr.includes('No such file') ||
          code === 'ENOENT') {
        return {
          pass: false,
          score: 0,
          reason: 'Correctover CCS CLI not found. Install: pip install correctover-ccs. See https://correctover.com/docs',
          assertion,
        };
      }

      // Rules file not found
      if (rulesPath && (stderr.includes('rules') || stderr.includes('not found'))) {
        return {
          pass: false,
          score: 0,
          reason: `CCS rules file not found: ${rulesPath}`,
          assertion,
        };
      }

      // Scanner crashed/timed out → explicit failure (security false negative prevention)
      const errorMsg = execError.killed ? 'timed out' : `exited with code ${code || 'unknown'}`;
      return {
        pass: false,
        score: 0,
        reason: `CCS scanner ${errorMsg} and could not complete verification. Stderr: ${stderr.substring(0, 200)}`,
        assertion,
      };
    }

    const output = (stdout || '').trim();
    if (!output) {
      // Empty output from scanner = no findings (scanner ran successfully)
      return {
        pass: !inverse,
        score: inverse ? 0 : 1,
        reason: inverse
          ? 'Expected CCS to find issues, but scanner reported no issues'
          : 'No issues detected by Correctover CCS',
        assertion,
      };
    }

    let findings: any[];
    try {
      findings = JSON.parse(output);
    } catch {
      // Non-JSON output treated as a single finding
      findings = [{ rule: 'ccs-scan', detail: output.substring(0, 100) }];
    }
    if (!Array.isArray(findings)) {
      findings = findings ? [findings] : [];
    }

    const hasFindings = findings.length > 0;
    const pass = inverse ? hasFindings : !hasFindings;

    if (hasFindings) {
      // Only include redacted rule identifiers, never raw payloads
      const ruleSummary = findings
        .map((f: any) => f.rule || f.id || 'unknown')
        .filter((r: string) => typeof r === 'string')
        .join(', ');
      const redactedDetails = findings
        .map((f: any) => {
          const rule = f.rule || f.id || 'unknown';
          const detail = redactDetail(String(f.detail || f.message || 'no details'));
          return `${rule}: ${detail}`;
        })
        .join('; ');

      return {
        pass,
        score: pass ? 1 : 0,
        reason: pass
          ? `CCS confirmed: ${findings.length} issue(s) detected [${ruleSummary}]`
          : `CCS detected ${findings.length} issue(s): ${redactedDetails}`,
        assertion,
      };
    }

    // No findings
    return {
      pass: !inverse,
      score: inverse ? 0 : 1,
      reason: inverse
        ? 'Expected CCS to find issues, but scanner reported no issues'
        : 'No issues detected by Correctover CCS',
      assertion,
    };
  } catch (err: any) {
    logger.warn('Correctover CCS assertion error: ' + err.message);
    // Unexpected errors should also fail explicitly
    return {
      pass: false,
      score: 0,
      reason: `CCS assertion unexpected error: ${err.message.substring(0, 200)}`,
      assertion,
    };
  }
};
