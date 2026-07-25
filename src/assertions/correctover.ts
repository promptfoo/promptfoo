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
 *     inverse: false                     // optional: invert pass/fail
 * ```
 *
 * Requires: pip install correctover-ccs (or fallback to built-in rules).
 * See https://correctover.com/docs for installation.
 */

const CCS_CLI_NOT_FOUND =
  'Correctover CCS CLI not found. Install: pip install correctover-ccs. See https://correctover.com/docs';

/** Redact potentially sensitive data (offending payload excerpts) from scanner output. */
function redactDetail(text: string): string {
  return text
    .replace(/[A-Za-z0-9+/=]{40,}/g, '<REDACTED>')
    .replace(/0x[0-9a-fA-F]{16,}/g, '<REDACTED>')
    .split('\n')
    .map((line) => (line.length > 120 ? line.substring(0, 117) + '...' : line))
    .join('\n')
    .substring(0, 1000);
}

/** Serialize a value to a JSON string for scanning. */
function serializeForScan(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value || null;
  try {
    const s = safeJsonStringify(value);
    return s && s !== '""' ? s : null;
  } catch {
    return null;
  }
}

/** Extract tool call payloads from provider response metadata, if present. */
function extractToolCalls(providerResponse: any): string[] {
  const payloads: string[] = [];
  const metadata = providerResponse?.metadata;
  if (!metadata) return payloads;

  // Standard toolCalls array (OpenAI, Anthropic, Claude Agent SDK, n8n, ElevenLabs, etc.)
  const toolCalls = metadata.toolCalls;
  if (Array.isArray(toolCalls)) {
    for (const tc of toolCalls) {
      if (tc.function?.arguments) {
        payloads.push(tc.function.arguments);
      }
      if (tc.input && typeof tc.input === 'object') {
        const s = serializeForScan(tc.input);
        if (s) payloads.push(s);
      }
      // Generic: serialize entire tool call if it has a name but no structured fields
      if (tc.name && !tc.function?.arguments && !tc.input) {
        const s = serializeForScan(tc);
        if (s) payloads.push(s);
      }
    }
  }

  // MCP provider direct metadata fields (MCPProvider.transformToolResult)
  // Stores toolArgs/originalPayload directly on metadata, not in toolCalls array
  if (metadata.toolArgs !== undefined) {
    const s = serializeForScan(metadata.toolArgs);
    if (s) payloads.push(s);
  }
  if (metadata.originalPayload !== undefined) {
    const s = serializeForScan(metadata.originalPayload);
    if (s) payloads.push(s);
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
      return { findings: [{ rule: 'ccs-scan', detail: redactDetail(output.substring(0, 200)) }], raw: redactDetail(output) };
    }

    const findings = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    // Sanitize raw output in case stderr diagnostics leaked into stdout
    const raw = stderr ? redactDetail(`${output}\n[stderr] ${stderr.substring(0, 200)}`) : redactDetail(output);
    return { findings, raw };
  } catch (err: any) {
    if (err.code === 'ENOENT' || (err.stderr || '').includes('command not found') || (err.stderr || '').includes('No such file')) {
      return null;
    }
    // Sanitize error message before re-throwing — may contain payload excerpts
    const sanitized = redactDetail(err.message || String(err));
    throw new Error(`CCS scanner execution failed: ${sanitized}`);
  }
}

export const handleCorrectover = async (params: AssertionParams): Promise<GradingResult> => {
  const { assertion, inverse = false, providerResponse, output: transformedOutput } = params;
  const payloads: string[] = [];

  // 1. Raw provider output
  const rawOutput = serializeForScan(providerResponse?.output);
  if (rawOutput) {
    payloads.push(rawOutput);
  }

  // 2. Post-transform output (from assertion transform function)
  //    Serialize first, then compare — avoids string-vs-object always-unequal bug
  if (transformedOutput !== undefined) {
    const transformed = serializeForScan(transformedOutput);
    if (transformed && transformed !== rawOutput) {
      payloads.push(transformed);
    }
  }

  // 3. Tool call payloads from metadata (agent providers store called tools here)
  try {
    const toolCallPayloads = extractToolCalls(providerResponse);
    payloads.push(...toolCallPayloads);
  } catch {
    // Silently skip if metadata structure is unexpected
  }

  if (payloads.length === 0) {
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
    const allFindings: any[] = [];

    for (const payload of payloads) {
      const result = await runCcsScanner(payload, rulesPath);
      if (result === null) {
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
        pass: inverse,
        score: inverse ? 1 : 0,
        reason: inverse
          ? `CCS confirmed violation as expected: ${allFindings.length} issue(s) detected [${ruleSummary}]`
          : `CCS detected ${allFindings.length} issue(s): ${detail}`,
        assertion,
      };
    }

    return {
      pass: !inverse,
      score: inverse ? 0 : 1,
      reason: inverse
        ? 'Expected CCS violations but none were detected'
        : 'No issues detected by Correctover CCS',
      assertion,
    };
  } catch (err: any) {
    logger.warn('Correctover CCS assertion error: ' + redactDetail(err.message || String(err)));
    return {
      pass: false,
      score: 0,
      reason: `CCS assertion could not complete: ${redactDetail(err.message)}`,
      assertion,
    };
  }
};
