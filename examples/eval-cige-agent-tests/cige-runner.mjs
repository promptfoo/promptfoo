// CIGE-aware runner exposed as a promptfoo custom provider.
//
// 1. Preflight: refuse to start if a mandatory guardrail cannot be enforced.
// 2. Execute the suggested path, checking every tool call against the guardrails
//    *before* it is dispatched. Blocked calls never reach the tool.
// 3. Redact forbidden patterns from tool output and collect evidence artifacts.
//
// The agent here is scripted: it follows execution.initial_path step by step. An LLM agent
// or an MCP client could replace the scripted loop and the fixture behind the same gate.

import {
  checkToolCall,
  classifyGuardrails,
  evaluateCriteria,
  redact,
  validateCige,
} from './cige.mjs';
import { createStreamingFixture } from './streaming-fixture.mjs';

const NOT_IMPLEMENTED_FIELDS = [['context', 'reveal_policy']];

export function runCige(cige, fixtureOptions = {}) {
  // Validation also compiles every forbid_output_pattern, so nothing can throw mid-run.
  const errors = validateCige(cige);
  if (errors.length > 0) {
    return {
      refusal: `Invalid CIGE case: ${errors.join('; ')}`,
      transcript: { status: 'invalid', errors, received: [] },
    };
  }
  const { enforced, advisory, unsupported } = classifyGuardrails(cige.guardrails);
  const notImplemented = NOT_IMPLEMENTED_FIELDS.filter(
    ([field, key]) => cige[field]?.[key] !== undefined,
  ).map(([field, key]) => `${field}.${key}`);

  if (unsupported.length > 0) {
    return {
      refusal: `CIGE preflight refused: this runner cannot enforce mandatory guardrail(s) ${unsupported
        .map(({ rule, kinds }) => `"${rule}"${kinds.length > 0 ? ` (${kinds.join(', ')})` : ''}`)
        .join(', ')}. No tool calls were made.`,
      transcript: { status: 'refused', unsupported, received: [] },
    };
  }

  const fixture = createStreamingFixture(fixtureOptions);
  const steps = [];
  const blocked = [];
  const evidence = {};
  let redactions = 0;

  cige.execution.initial_path.forEach(({ tool, args = {} }, index) => {
    const gate = checkToolCall(cige, enforced, tool);
    if (!gate.allowed) {
      blocked.push({ index, tool, reasons: gate.reasons });
      steps.push({ index, tool, status: 'blocked', reason: gate.reasons.join('; ') });
      return;
    }
    const { value: result, count } = redact(fixture.call(tool, args), enforced);
    redactions += count;
    if (result.ok && result.artifact) {
      evidence[result.artifact] = result.data;
    }
    steps.push({ index, tool, status: result.ok ? 'ok' : 'error', result });
  });

  // Final pass over everything emitted, so a forbidden value kept elsewhere (for example in
  // the observed state) cannot leak around the per-step redaction.
  const { value: transcript, count } = redact(
    {
      status: 'completed',
      runner: 'scripted',
      steps,
      blocked,
      evidence,
      state: fixture.state,
      // Checked against the raw state, before redaction can hide a value a criterion needs.
      criteria: evaluateCriteria(cige, fixture.state),
      // Calls that actually reached the fixture, so blocked calls can be shown to be absent.
      received: fixture.received.map(({ tool }) => tool),
      advisory,
      notImplemented,
    },
    enforced,
  );
  return { transcript: { ...transcript, redactions: redactions + count } };
}

export default class CigeRunner {
  constructor(options = {}) {
    this.providerId = options.id ?? 'cige-scripted-runner';
    this.config = options.config ?? {};
  }

  id() {
    return this.providerId;
  }

  async callApi(_prompt, context) {
    const { refusal, transcript } = runCige(context?.vars?.cige, context?.vars?.fixture ?? {});
    if (refusal) {
      return { error: refusal, metadata: { cige: transcript } };
    }
    return { output: transcript };
  }
}
