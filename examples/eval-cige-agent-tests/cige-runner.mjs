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
  checkEvidence,
  checkToolCall,
  classifyGuardrails,
  evaluateCriteria,
  gradeCige,
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
    // Refusals go through the same redaction as completed runs.
    const message = `CIGE preflight refused: this runner cannot enforce mandatory guardrail(s) ${unsupported
      .map(({ rule, kinds }) => `"${rule}"${kinds.length > 0 ? ` (${kinds.join(', ')})` : ''}`)
      .join(', ')}. No tool calls were made.`;
    return {
      refusal: redact(message, enforced).value,
      transcript: redact({ status: 'refused', unsupported, received: [] }, enforced).value,
    };
  }

  const fixture = createStreamingFixture(fixtureOptions);
  const steps = [];
  const blocked = [];
  const evidence = {};

  cige.execution.initial_path.forEach(({ tool, args = {} }, index) => {
    const gate = checkToolCall(cige, enforced, tool);
    if (!gate.allowed) {
      blocked.push({ index, tool, reasons: gate.reasons });
      steps.push({ index, tool, status: 'blocked', reason: gate.reasons.join('; ') });
      return;
    }
    const raw = fixture.call(tool, args);
    // Index evidence by the raw artifact name; the final pass redacts the emitted values.
    if (raw.ok && raw.artifact) {
      evidence[raw.artifact] = raw.data;
    }
    steps.push({ index, tool, status: raw.ok ? 'ok' : 'error', result: raw });
  });

  const observation = {
    status: 'completed',
    runner: 'scripted',
    steps,
    blocked,
    evidence,
    state: fixture.state,
    criteria: evaluateCriteria(cige, fixture.state),
    evidenceChecks: checkEvidence(cige, evidence),
    received: fixture.received.map(({ tool }) => tool),
    advisory,
    notImplemented,
  };
  const { value: transcript, count } = redact(observation, enforced);
  const grade = gradeCige(cige, { ...observation, redactions: count });
  // Keep the assertion's booleans and scores independent of transcript redaction.
  // Only the explanations carry text from the case or fixture.
  grade.reason = redact(grade.reason, enforced).value;
  for (const component of grade.componentResults) {
    component.reason = redact(component.reason, enforced).value;
  }
  return { transcript: { ...transcript, redactions: count }, grade };
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
    const { refusal, transcript, grade } = runCige(
      context?.vars?.cige,
      context?.vars?.fixture ?? {},
    );
    if (refusal) {
      return { error: refusal, metadata: { cige: transcript } };
    }
    return { output: transcript, metadata: { cigeGrade: grade } };
  }
}
