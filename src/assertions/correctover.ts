import { spawn } from 'child_process';
import logger from '../logger';
import { safeJsonStringify } from '../util/json';
import type { AssertionParams, GradingResult } from '../types/index';

/**
 * Correctover CCS (Call Shield) assertion handler.
 *
 * Validates AI agent tool call outputs against Correctover's runtime
 * call verification rules using 6-dimension verification
 * (structure, schema, latency, cost, identity, integrity).
 *
 * Usage in promptfoo config (under tests[].assert):
 * ```yaml
 * tests:
 *   - assert:
 *       - type: correctover
 *         value: /path/to/ccs-rules.yaml    # optional: custom rule file
 * ```
 *
 * Requires: pip install correctover-ccs
 * See https://correctover.com/docs for installation.
 */

const CCS_CLI_NOT_FOUND =
  'Correctover CCS CLI not found. Install: pip install correctover-ccs. See https://correctover.com/docs';

/** Redact sensitive data (credentials, tokens, payloads) from text. */
function redactSensitive(text: string): string {
  return text
    .replace(/\b(ghp_|gho_|ghu_|ghs_|ghr_|sk-|sk_)[A-Za-z0-9]{10,}/g, '<REDACTED>')
    .replace(/password\s*[=:]\s*\S+/gi, 'password=<REDACTED>')
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, '<REDACTED>')
    .replace(/[A-Za-z0-9+/=]{40,}/g, '<REDACTED>')
    .replace(/0x[0-9a-fA-F]{16,}/g, '<REDACTED>')
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer <REDACTED>')
    .split('\n')
    .map((line) => (line.length > 120 ? line.substring(0, 117) + '...' : line))
    .join('\n')
    .substring(0, 1000);
}

/** Serialize a value to a JSON string for scanning. */
function serializeForScan(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'string') {
    return value || null;
  }
  try {
    const s = safeJsonStringify(value);
    return s && s !== '""' ? s : null;
  } catch {
    return null;
  }
}

/**
 * Extract tool call payloads from provider response metadata.
 */
function extractToolCalls(providerResponse: Record<string, unknown> | undefined): string[] {
  const payloads: string[] = [];
  if (!providerResponse) {
    return payloads;
  }
  const metadata = providerResponse.metadata;
  if (!metadata || typeof metadata !== 'object') {
    return payloads;
  }
  const meta = metadata as Record<string, unknown>;

  // Standard toolCalls array (OpenAI, Anthropic, Claude Agent SDK)
  const toolCalls = meta.toolCalls;
  if (Array.isArray(toolCalls)) {
    for (const tc of toolCalls) {
      const tcObj = tc as Record<string, unknown>;
      if (tcObj.function && typeof tcObj.function === 'object') {
        const fn = tcObj.function as Record<string, unknown>;
        if (fn.arguments) {
          payloads.push(
            typeof fn.arguments === 'string'
              ? fn.arguments
              : serializeForScan(fn.arguments) ?? '',
          );
        }
      }
      if (tcObj.input && typeof tcObj.input === 'object') {
        const s = serializeForScan(tcObj.input);
        if (s) {
          payloads.push(s);
        }
      }
      if (tcObj.name && !tcObj.function && !tcObj.input && !tcObj.arguments) {
        const s = serializeForScan(tcObj);
        if (s) {
          payloads.push(s);
        }
      }
    }
  }

  // n8n snake_case variant
  const toolCallsSnake = meta.tool_calls;
  if (Array.isArray(toolCallsSnake)) {
    for (const tc of toolCallsSnake) {
      const tcObj = tc as Record<string, unknown>;
      if (tcObj.arguments) {
        const s = serializeForScan(tcObj.arguments);
        if (s) {
          payloads.push(s);
        }
      }
      if (tcObj.name && !tcObj.arguments) {
        const s = serializeForScan(tcObj);
        if (s) {
          payloads.push(s);
        }
      }
    }
  }

  // Actions metadata
  const actions = meta.actions;
  if (Array.isArray(actions)) {
    for (const action of actions) {
      const s = serializeForScan(action);
      if (s) {
        payloads.push(s);
      }
    }
  }

  // MCP provider direct metadata fields
  if (meta.toolArgs !== undefined) {
    const s = serializeForScan(meta.toolArgs);
    if (s) {
      payloads.push(s);
    }
  }
  if (meta.originalPayload !== undefined) {
    const s = serializeForScan(meta.originalPayload);
    if (s) {
      payloads.push(s);
    }
  }

  return payloads.filter((p) => p.length > 0);
}

/**
 * Run CCS scanner CLI with the given payload via stdin.
 * Uses spawn (not exec) to avoid shell injection from rules paths.
 */
async function runCcsScanner(
  payload: string,
  rulesPath?: string,
): Promise<{ findings: Record<string, unknown>[]; raw: string } | null> {
  const args = ['scan', '--format', 'json', '--input', '-'];
  if (rulesPath) {
    args.push('--rules', rulesPath);
  }

  return new Promise((resolve, reject) => {
    const child = spawn('ccs', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
      reject(new Error('CCS scanner timed out after 30 seconds'));
    }, 30_000);

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('error', (err: Error & { code?: string }) => {
      clearTimeout(timer);
      if (err.code === 'ENOENT') {
        resolve(null);
        return;
      }
      reject(new Error(`CCS scanner failed to start: ${err.message}`));
    });

    child.on('close', (code: number | null) => {
      clearTimeout(timer);
      if (timedOut) {
        return;
      }

      if (stderr.includes('command not found') || stderr.includes('No such file')) {
        resolve(null);
        return;
      }

      const output = (stdout || '').trim();
      if (!output) {
        reject(
          new Error(
            `CCS scanner produced no output (exit code: ${String(code)}). ` +
              'This may indicate a scanner failure rather than a clean scan.',
          ),
        );
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(output);
      } catch {
        reject(
          new Error(
            `CCS scanner returned non-JSON output: ${redactSensitive(output.substring(0, 200))}`,
          ),
        );
        return;
      }

      const findings: Record<string, unknown>[] = Array.isArray(parsed)
        ? (parsed as Record<string, unknown>[])
        : parsed
          ? [parsed as Record<string, unknown>]
          : [];
      const raw = redactSensitive(output);
      resolve({ findings, raw });
    });

    // Write payload to stdin and close
    child.stdin.write(payload);
    child.stdin.end();
  });
}

export const handleCorrectover = async (params: AssertionParams): Promise<GradingResult> => {
  const { assertion, inverse = false, providerResponse, output: transformedOutput, renderedValue } = params;
  const payloads: string[] = [];

  // 1. Raw provider output
  const rawOutput = serializeForScan(providerResponse?.output);
  if (rawOutput) {
    payloads.push(rawOutput);
  }

  // 2. Post-transform output (from assertion transform function)
  if (transformedOutput !== undefined) {
    const transformed = serializeForScan(transformedOutput);
    if (transformed && transformed !== rawOutput) {
      payloads.push(transformed);
    }
  }

  // 3. Tool call payloads from metadata
  try {
    const toolCallPayloads = extractToolCalls(
      providerResponse as Record<string, unknown> | undefined,
    );
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

  // Determine custom rules path — prefer renderedValue over raw value
  const rulesPath =
    typeof renderedValue === 'string' && renderedValue.length > 0
      ? renderedValue
      : typeof assertion.value === 'string' && assertion.value.length > 0
        ? assertion.value
        : undefined;

  try {
    const allFindings: Record<string, unknown>[] = [];

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
      const ruleSummary = allFindings
        .map((f) => (f.rule as string) || (f.id as string) || 'unknown')
        .join(', ');
      const detail = allFindings
        .map((f) => {
          const rule = (f.rule as string) || (f.id as string) || 'unknown';
          const msg = redactSensitive(
            (f.detail as string) || (f.message as string) || 'no details',
          );
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
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const sanitizedMsg = redactSensitive(errMsg);
    logger.warn('Correctover CCS assertion error: ' + sanitizedMsg);
    return {
      pass: false,
      score: 0,
      reason: `CCS assertion could not complete: ${sanitizedMsg}`,
      assertion,
    };
  }
};
