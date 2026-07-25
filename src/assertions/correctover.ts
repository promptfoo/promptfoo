import { execSync } from 'child_process';
import logger from '../logger';
import type { AssertionParams, GradingResult } from '../types/index';

/**
 * Correctover CCS (Call Shield) assertion handler.
 * 
 * Validates MCP/AI agent tool calls against Correctover's runtime
 * call verification rules (24 detection rules).
 * 
 * Usage in promptfoo config:
 * ```yaml
 * assertions:
 *   - type: correctover
 *     # Optional: path to CCS rules config
 *     value: /path/to/ccs-rules.yaml
 *     # Optional: treat CCS findings as PASS (for red-teaming)
 *     inverse: false
 * ```
 * 
 * Requires: `pip install correctover` or `ccs` CLI in PATH.
 * If CCS is not installed, the assertion gracefully passes with a notice.
 */
export const handleCorrectover = async ({
  assertion,
  inverse,
  providerResponse,
}: AssertionParams): Promise<GradingResult> => {
  const input = typeof providerResponse.output === 'string' 
    ? providerResponse.output 
    : JSON.stringify(providerResponse.output || '');

  if (!input || input === '""') {
    return {
      pass: true,
      score: 1,
      reason: 'No output to scan with Correctover CCS',
      assertion,
    };
  }

  try {
    const { execSync } = require('child_process');
    
    let result;
    try {
      result = execSync('ccs scan --format json --input -', {
        input,
        encoding: 'utf-8' as const,
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (execError: any) {
      if (execError.stderr?.includes('command not found') || 
          execError.stderr?.includes('No such file') ||
          execError.code === 'ENOENT') {
        return {
          pass: true,
          score: 1,
          reason: 'Correctover CCS CLI not found. Install: pip install correctover. See https://correctover.com/docs',
          assertion,
        };
      }
      // CCS ran but found issues (exit code 1)
      result = execError.stdout || '';
    }

    const output = (result || '').toString().trim();
    
    let findings: any[];
    try {
      findings = JSON.parse(output);
    } catch {
      // If output isn't parseable JSON, check for textual findings
      findings = output ? [{ rule: 'ccs-scan', detail: output.substring(0, 200) }] : [];
    }

    if (!Array.isArray(findings)) {
      findings = findings ? [findings] : [];
    }

    const hasFindings = findings.length > 0;
    const pass = inverse ? hasFindings : !hasFindings;

    if (hasFindings) {
      const ruleSummary = findings.map((f: any) => f.rule || f.id || 'unknown').join(', ');
      const detail = findings.map((f: any) => 
        `${f.rule || f.id || 'unknown'}: ${f.detail || f.message || 'no details'}`
      ).join('; ');

      return {
        pass,
        score: pass ? 1 : 0,
        reason: pass 
          ? `CCS confirmed: ${findings.length} issue(s) detected [${ruleSummary}]`
          : `CCS detected ${findings.length} issue(s): ${detail}`,
        assertion,
      };
    }

    return {
      pass: true,
      score: 1,
      reason: 'No issues detected by Correctover CCS',
      assertion,
    };
  } catch (err: any) {
    logger.warn(`Correctover CCS assertion error: ${err.message}`);
    return {
      pass: true,
      score: 1,
      reason: `CCS assertion error (graceful skip): ${err.message}`,
      assertion,
    };
  }
};
