import { exec } from 'child_process';
import { safeJsonStringify } from '../util';
import { promisify } from 'util';
import logger from '../logger';
import type { AssertionParams, GradingResult } from '../types/index';

const execAsync = promisify(exec);

/**
 * Correctover CCS (Call Shield) assertion handler.
 *
 * Validates AI agent tool call outputs against Correctover's runtime
 * call verification rules (24 detection rules across 7 categories).
 *
 * Usage in promptfoo config:
 * ```yaml
 * assertions:
 *   - type: correctover
 *     value: /path/to/ccs-rules.yaml    # optional: custom rule file
 *     inverse: false                     # optional: invert pass/fail
 * ```
 *
 * Requires: pip install correctover-ccs (or fallback to built-in rules).
 * See https://correctover.com/docs for installation.
 */

const CCS_CLI_NOT_FOUND = 'Correctover CCS CLI not found. Install: pip install correctover-ccs. See https://correctover.com/docs';

/** Redact potentially sensitive data (offending payload excerpts) from scanner output. */
function redactDetail(text: string): string {
  // Remove long base64-like or hex blobs that could be payload excerpts
  return text
    .replace(/[A-Za-z0-9+/=]{40,}/g, '<REDACTED>')
    .replace(/0x[0-9a-fA-F]{16,}/g, '<REDACTED>')
    // Truncate lines longer than 120 chars
    .split('\n')
    .map((line) => (line.length > 120 ? line.substring(0, 117) + '...' : line))
    .join('\n')
    // Cap total length
    .substring(0, 1000);
}

/** Extract tool call payloads from provider response metadata, if present. */
function extractToolCalls(providerResponse: any): string[] {
  const payloads: string[] = [];
  const toolCalls = providerResponse?.metadata?.toolCalls;
  if (Array.isArray(toolCalls)) {
    for (const tc of toolCalls) {
      // OpenAI-style: { id, type, function: { name, arguments } }
      if (tc.function?.arguments) {
        payloads.push(tc.function.arguments);
      }
      // Anthropic-style: { id, name, input }
      if (tc.input && typeof tc.input === 'object') {
        payloads.push(JSON.stringify(tc.input));
      }
    }
  }
  return payloads;
}

/** Run CCS scanner CLI with the given payload. Returns findings array or null on error. */
async function runCcsScanner(
  payload: string,
  rulesPath?: string,
): Promise<{ findings: any[]; raw: string } | null> {
  let args = 'ccs scan --format json --input -';
  if (rulesPath) {
    args += ` --rules "${rulesPath}"`;
  }

  try {
    const { stdout, stderr } = await execAsync(args, {
      input: payload,
      timeout: 30_000,
      maxBuffer: 10 * 1024 * 1024,
    });

    if (stderr && stderr.includes('command not found')) {
      return null; // CLI not found — caller handles
    }

    const output = (stdout || '').trim();
    if (!output) {
      return { findings: [], raw: '' };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(output);
    } catch {
      return { findings: [{ rule: 'ccs-scan', detail: redactDetail(output.substring(0, 200)) }], raw: output };
    }

    const findings = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    return { findings, raw: output };
  } catch (err: any) {
    // ENOENT = CLI not installed
    if (err.code === 'ENOENT' || (err.stderr || '').includes('command not found') || (err.stderr || '').includes('No such file')) {
      return null;
    }
    // Other errors: timeout, crash, invalid args — re-throw as assertion failure
    throw new Error(`CCS scanner execution failed: ${redactDetail(err.message || String(err))}`);
  }
}

export const handleCorrectover = async ({
  assertion,
  inverse = false,
  providerResponse,
}: AssertionParams): Promise<GradingResult> => {
  // Collect payloads to scan: primary output + tool calls from metadata
  const payloads: string[] = [];

  // 1. Primary output
  const output = typeof providerResponse?.output === 'string'
    ? providerResponse.output
    : providerResponse?.output
      ? safeJsonStringify(providerResponse.output)
      : null;
  if (output && output !== '""') {
    payloads.push(output);
  }

  // 2. Tool call payloads from metadata (agent providers store called tools here)
  try {
    const toolCallPayloads = extractToolCalls(providerResponse);
    payloads.push(...toolCallPayloads);
  } catch {
    // Silently skip if metadata structure is unexpected
  }

  if (payloads.length === 0) {
    // Nothing to scan — pass or fail based on inversion
    return {
      pass: !inverse,
      score: inverse ? 0 : 1,
      reason: inverse
        ? 'No output to scan: expected CCS violations but nothing was produced'
        : 'No output to scan with Correctover CCS',
      assertion,
    };
  }

  // Determine custom rules path from assertion value
  const rulesPath = typeof assertion.value === 'string' && assertion.value.length > 0
    ? assertion.value
    : undefined;

  try {
    // Scan each payload and collect all findings
    const allFindings: any[] = [];

    for (const payload of payloads) {
      const result = await runCcsScanner(payload, rulesPath);
      if (result === null) {
        // CLI not found — explicit failure (prevents security false negatives)
        return {
          pass: false,
          score: 0,
          reason: CCS_CLI_NOT_FOUND,
          assertion,
        };
      }
      allFindings.push(...result.findings);
    }

    const hasFindings = allFindings.length > 0;

    if (hasFindings) {
      const ruleSummary = allFindings.map((f: any) => f.rule || f.id || 'unknown').join(', ');
      const detail = allFindings
        .map((f: any) => {
          const rule = f.rule || f.id || 'unknown';
          const msg = redactDetail(f.detail || f.message || 'no details');
          return `${rule}: ${msg}`;
        })
        .join('; ');

      return {
        pass: inverse ? true : false, // hasFindings => normal: fail, inverse: pass (expected)
        score: inverse ? 1 : 0,
        reason: inverse
          ? `CCS confirmed violation as expected: ${allFindings.length} issue(s) detected [${ruleSummary}]`
          : `CCS detected ${allFindings.length} issue(s): ${detail}`,
        assertion,
      };
    }

    // No findings
    return {
      pass: inverse ? false : true, // No findings => pass normal, fail inverse
      score: inverse ? 0 : 1,
      reason: inverse
        ? 'Expected CCS violations but none were detected'
        : 'No issues detected by Correctover CCS',
      assertion,
    };
  } catch (err: any) {
    // Explicit failure on scanner error (crash, timeout, etc.)
    logger.warn('Correctover CCS assertion error: ' + err.message);
    return {
      pass: false,
      score: 0,
      reason: `CCS assertion failed: ${redactDetail(err.message)}`,
      assertion,
    };
  }
};
