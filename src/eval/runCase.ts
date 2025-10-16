// src/eval/runCase.ts

import { AppError, toolError } from '../lib/errors';
import type * as R from '../types/result';

/**
 * Runs a single eval case.
 * Convention:
 *  - Assertion failures => pass=false, populate gradingResult (NO `error`)
 *  - Infra/runtime/validation/timeout => pass=false, set `error: EvalErrorInfo`
 */
export async function runCase(ctx: any): Promise<R.CaseResult> {
  try {
    // Provider call (can be wrapped by guardrails/withRetries upstream)
    const output = await ctx.provider.invoke(ctx.input);

    // Turn assertion rules into a Promptfoo-aligned grading block
    const grading = await evaluateAssertionsToGrading(output, ctx.assertions);

    if (!grading.pass) {
      // Logical failure path (assertions mismatched) — no `error`
      return {
        pass: false,
        score: grading.score,
        reason: grading.reason,
        gradingResult: grading,
        metadata: {
          // optionally add latency/tokens/cost if your ctx has them
        },
      };
    }

    // Success
    return {
      pass: true,
      score: grading.score,
      reason: grading.reason,
      gradingResult: grading,
      metadata: {
        // optionally add telemetry
      },
    };
  } catch (e: any) {
    // Infra/runtime/validation/timeout — structured error bucket
    if (e instanceof AppError) {
      return { pass: false, reason: e.message, error: e.toInfo() };
    }
    // Unknown tool error (normalize)
    const t = toolError('Unexpected tool error', {
      raw: { message: e?.message, stack: e?.stack },
      hint: 'Re-run with --debug and attach stack trace to a bug report.',
    });
    return { pass: false, reason: t.message, error: t.toInfo() };
  }
}

/** Convert assertion rules into a GradingResult. */
async function evaluateAssertionsToGrading(
  output: string,
  rules: any[],
): Promise<R.GradingResult> {
  const details: R.AssertionDetail[] = [];
  let failed = 0;
  let passed = 0;

  for (const r of rules ?? []) {
    const ok = applyRule(r, output);
    if (ok) {
      passed++;
    } else {
      failed++;
      details.push({
        name: r.name ?? r.type,
        message: r.message ?? 'Output did not satisfy rule',
        expected: r.expected,
        actual: summarize(output),
      });
    }
  }

  const total = passed + failed;
  const score = total > 0 ? passed / total : 1;

  return {
    pass: failed === 0,
    score,
    reason: failed === 0 ? 'All assertions passed' : `${failed} assertion(s) failed`,
    details,
  };
}

/** Placeholder: replace with the real rule evaluation. */
function applyRule(_rule: any, _output: string): boolean {
  // TODO: wire to the actual assertion engine
  return true;
}

function summarize(s: string): string {
  return s && s.length > 200 ? s.slice(0, 200) + '…' : s;
}
