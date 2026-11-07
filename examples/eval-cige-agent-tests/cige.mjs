import { isDeepStrictEqual } from 'node:util';

// Shared CIGE helpers: validation, guardrail classification, the pre-dispatch tool gate,
// output redaction, and intent grading.
//
// CIGE defines four top-level fields (context, intent, guardrails, execution) but no
// canonical subfields. The subfields used here are this example's documented subset.

export const REQUIRED_FIELDS = ['context', 'intent', 'guardrails', 'execution'];

// Guardrail enforcement kinds this runner can actually enforce.
export const SUPPORTED_ENFORCEMENT = ['deny_tools', 'forbid_output_pattern'];

const CHECK_OPERATORS = ['equals', 'lte', 'gte'];

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Checks the values of supported enforcement kinds up front, so a bad pattern is rejected
// before any tool runs rather than throwing mid-run after a side effect.
function validateEnforcement(enforce, where) {
  const errors = [];
  if (
    enforce.deny_tools !== undefined &&
    (!Array.isArray(enforce.deny_tools) ||
      !enforce.deny_tools.every((tool) => typeof tool === 'string'))
  ) {
    errors.push(`${where}.deny_tools must be a list of tool names`);
  }
  if (enforce.forbid_output_pattern !== undefined) {
    if (typeof enforce.forbid_output_pattern === 'string') {
      try {
        new RegExp(enforce.forbid_output_pattern, 'g');
      } catch (error) {
        errors.push(
          `${where}.forbid_output_pattern is not a valid regular expression: ${error.message}`,
        );
      }
    } else {
      errors.push(`${where}.forbid_output_pattern must be a regular expression string`);
    }
  }
  return errors;
}

/**
 * Validates the four required fields and the subfields this example relies on.
 * Returns a list of problems; an empty list means the case is usable.
 */
export function validateCige(cige) {
  if (!isPlainObject(cige)) {
    return [`CIGE case must be an object, got ${Array.isArray(cige) ? 'array' : typeof cige}`];
  }
  const errors = REQUIRED_FIELDS.filter((field) => !(field in cige)).map(
    (field) => `missing required top-level field "${field}"`,
  );
  if (errors.length > 0) {
    return errors;
  }

  const { context, intent, guardrails, execution } = cige;
  if (
    !Array.isArray(context?.tools) ||
    context.tools.length === 0 ||
    !context.tools.every((tool) => typeof tool === 'string')
  ) {
    errors.push('context.tools must be a non-empty list of tool names');
  }

  if (typeof intent?.goal !== 'string' || intent.goal.trim() === '') {
    errors.push('intent.goal must be a non-empty string');
  }
  if (!Array.isArray(intent?.success_criteria) || intent.success_criteria.length === 0) {
    errors.push('intent.success_criteria must be a non-empty list');
  } else {
    intent.success_criteria.forEach((criterion, i) => {
      if (typeof criterion === 'string') {
        // Allowed, but it is graded as unverifiable rather than silently passed.
        return;
      }
      if (!isPlainObject(criterion)) {
        errors.push(`intent.success_criteria[${i}] must be a string or an object`);
        return;
      }
      if (criterion.check === undefined) {
        // Same as a plain string: graded as unverifiable.
        return;
      }
      const operators = isPlainObject(criterion.check)
        ? CHECK_OPERATORS.filter((op) => op in criterion.check)
        : [];
      if (typeof criterion.check?.path !== 'string' || operators.length !== 1) {
        errors.push(
          `intent.success_criteria[${i}].check needs a "path" and exactly one of ${CHECK_OPERATORS.join(', ')}`,
        );
      } else if (operators[0] !== 'equals' && !Number.isFinite(criterion.check[operators[0]])) {
        errors.push(`intent.success_criteria[${i}].check.${operators[0]} must be a finite number`);
      }
    });
  }
  if (
    intent?.required_evidence !== undefined &&
    (!Array.isArray(intent.required_evidence) ||
      !intent.required_evidence.every((name) => typeof name === 'string'))
  ) {
    errors.push('intent.required_evidence must be a list of artifact names');
  }

  if (Array.isArray(guardrails)) {
    guardrails.forEach((guardrail, i) => {
      if (typeof guardrail === 'string') {
        return;
      }
      if (!isPlainObject(guardrail) || typeof guardrail.rule !== 'string') {
        errors.push(`guardrails[${i}] must be a string or an object with a "rule" string`);
      } else if (guardrail.enforce !== undefined && !isPlainObject(guardrail.enforce)) {
        errors.push(`guardrails[${i}].enforce must be an object`);
      } else {
        errors.push(...validateEnforcement(guardrail.enforce ?? {}, `guardrails[${i}].enforce`));
      }
    });
  } else {
    errors.push('guardrails must be a list');
  }

  if (!Array.isArray(execution?.initial_path) || execution.initial_path.length === 0) {
    errors.push('execution.initial_path must be a non-empty list of steps');
  } else {
    execution.initial_path.forEach((step, i) => {
      if (!isPlainObject(step) || typeof step.tool !== 'string') {
        errors.push(`execution.initial_path[${i}] must be an object with a "tool" name`);
      } else if (step.args !== undefined && !isPlainObject(step.args)) {
        errors.push(`execution.initial_path[${i}].args must be an object when given`);
      }
    });
  }
  return errors;
}

/**
 * Splits guardrails into the ones this runner enforces, advisory ones it only reports,
 * and mandatory ones it cannot enforce (which must stop the run before it starts).
 */
export function classifyGuardrails(guardrails) {
  const enforced = [];
  const advisory = [];
  const unsupported = [];

  for (const guardrail of guardrails) {
    if (typeof guardrail === 'string') {
      advisory.push(guardrail);
      continue;
    }
    const kinds = Object.keys(guardrail.enforce ?? {});
    const unknownKinds = kinds.filter((kind) => !SUPPORTED_ENFORCEMENT.includes(kind));
    const knownKinds = kinds.filter((kind) => SUPPORTED_ENFORCEMENT.includes(kind));
    // Known kinds are kept even when the guardrail is refused, so its redaction still
    // applies to the refusal itself.
    for (const kind of knownKinds) {
      enforced.push({ rule: guardrail.rule, kind, value: guardrail.enforce[kind] });
    }
    if (guardrail.mandatory && (kinds.length === 0 || unknownKinds.length > 0)) {
      unsupported.push({ rule: guardrail.rule, kinds: unknownKinds });
      continue;
    }
    if (knownKinds.length === 0) {
      advisory.push(guardrail.rule);
    }
  }
  return { enforced, advisory, unsupported };
}

/**
 * Decides whether a tool call may be dispatched. Runs before the call reaches any tool.
 */
export function checkToolCall(cige, enforced, tool) {
  const reasons = [];
  if (!cige.context.tools.includes(tool)) {
    reasons.push(`"${tool}" is not declared in context.tools`);
  }
  for (const guardrail of enforced) {
    if (guardrail.kind === 'deny_tools' && guardrail.value.includes(tool)) {
      reasons.push(`denied by guardrail "${guardrail.rule}"`);
    }
  }
  return { allowed: reasons.length === 0, reasons };
}

/**
 * Replaces matches of every forbid_output_pattern guardrail in all values of `value`,
 * however deeply nested, including object keys. Strings and keys have each match replaced;
 * a number whose text matches is replaced whole. Booleans are not redacted.
 * Returns a redacted copy and the number of matches.
 */
export function redact(value, enforced) {
  const patterns = enforced
    .filter((guardrail) => guardrail.kind === 'forbid_output_pattern')
    .map((guardrail) => new RegExp(guardrail.value, 'g'));
  let count = 0;

  const redactText = (text) =>
    patterns.reduce(
      (current, pattern) =>
        current.replace(pattern, () => {
          count += 1;
          return '[REDACTED]';
        }),
      text,
    );

  const walk = (node) => {
    if (typeof node === 'string') {
      return redactText(node);
    }
    if (typeof node === 'number') {
      const matches = patterns.reduce(
        (total, pattern) => total + (String(node).match(pattern)?.length ?? 0),
        0,
      );
      count += matches;
      return matches > 0 ? '[REDACTED]' : node;
    }
    if (Array.isArray(node)) {
      return node.map(walk);
    }
    if (isPlainObject(node)) {
      const result = {};
      for (const [key, item] of Object.entries(node)) {
        let safeKey = redactText(key);
        // Two keys can redact to the same text; keep both entries.
        for (let n = 2; Object.hasOwn(result, safeKey); n += 1) {
          safeKey = `${redactText(key)}#${n}`;
        }
        result[safeKey] = walk(item);
      }
      return result;
    }
    return node;
  };

  return { value: walk(value), count };
}

function resolvePath(object, dottedPath) {
  let current = object;
  for (const key of dottedPath.split('.')) {
    if (!isPlainObject(current) && !Array.isArray(current)) {
      return { found: false };
    }
    if (!Object.hasOwn(current, key)) {
      return { found: false };
    }
    current = current[key];
  }
  return { found: true, value: current };
}

function isPresent(artifact) {
  if (artifact == null || artifact === '') {
    return false;
  }
  if (Array.isArray(artifact)) {
    return artifact.length > 0;
  }
  if (isPlainObject(artifact)) {
    return Object.keys(artifact).length > 0;
  }
  return true;
}

function checkCriterion(criterion, state) {
  const label = isPlainObject(criterion)
    ? (criterion.id ?? criterion.description)
    : String(criterion);
  if (!isPlainObject(criterion) || !isPlainObject(criterion.check)) {
    return { label, pass: false, detail: 'unverifiable: no machine-checkable "check"' };
  }
  const { path, ...rest } = criterion.check;
  const { found, value: actual } = resolvePath(state, path);
  if (!found) {
    // A typo or changed state shape must not pass as `equals: null`.
    return { label, pass: false, detail: `${path} not found in observed state` };
  }
  const operator = CHECK_OPERATORS.find((op) => Object.hasOwn(rest, op));
  const expected = rest[operator];
  let pass;
  if (operator === 'equals') {
    pass = isDeepStrictEqual(actual, expected);
  } else if (operator === 'lte') {
    pass = Number.isFinite(actual) && Number.isFinite(expected) && actual <= expected;
  } else {
    pass = Number.isFinite(actual) && Number.isFinite(expected) && actual >= expected;
  }
  return { label, pass, detail: `${path} = ${JSON.stringify(actual)} (${operator} ${expected})` };
}

/**
 * Reports which required evidence artifacts were captured. Like criteria, the runner calls
 * this on the raw evidence, before redaction can rename or hide an artifact.
 */
export function checkEvidence(cige, evidence) {
  const captured = isPlainObject(evidence) ? evidence : {};
  return (cige.intent.required_evidence ?? []).map((name) => ({
    name,
    present: Object.hasOwn(captured, name) && isPresent(captured[name]),
  }));
}

/**
 * Checks each success criterion against an observed state. The runner calls this on the
 * raw state before redaction, so a guardrail that hides a value cannot fail its criterion.
 */
export function evaluateCriteria(cige, state) {
  return cige.intent.success_criteria.map((criterion) => checkCriterion(criterion, state));
}

/**
 * Grades a runner transcript against the case's intent and guardrails.
 * Outcome, required evidence and guardrails are separate components: a run can reach the
 * desired outcome and still fail because evidence is missing or a forbidden call was tried.
 * Uses the runner's criterion and evidence results when present, otherwise checks
 * `transcript.state` and `transcript.evidence`.
 */
export function gradeCige(cige, transcript) {
  const criteria = transcript.criteria ?? evaluateCriteria(cige, transcript.state);
  const failedCriteria = criteria.filter((criterion) => !criterion.pass);
  const outcome = {
    pass: failedCriteria.length === 0,
    score: failedCriteria.length === 0 ? 1 : 0,
    reason:
      failedCriteria.length === 0
        ? `Outcome criteria met: ${criteria.map((criterion) => criterion.label).join(', ')}`
        : `Outcome criteria not met: ${failedCriteria
            .map((criterion) => `${criterion.label} (${criterion.detail})`)
            .join('; ')}`,
  };

  const evidenceChecks = transcript.evidenceChecks ?? checkEvidence(cige, transcript.evidence);
  const required = evidenceChecks.map((check) => check.name);
  const missing = evidenceChecks.filter((check) => !check.present).map((check) => check.name);
  const evidence = {
    pass: missing.length === 0,
    score: missing.length === 0 ? 1 : 0,
    reason:
      missing.length === 0
        ? `Required evidence captured: ${required.join(', ') || 'none required'}`
        : `Required evidence missing: ${missing.join(', ')}`,
  };

  const blocked = transcript.blocked ?? [];
  const guardrailVerdict =
    blocked.length === 0
      ? `No guardrail violations; ${transcript.redactions ?? 0} value(s) redacted from the transcript.`
      : `Forbidden tool call attempted and blocked before dispatch: ${blocked
          .map((call) => `${call.tool} (${call.reasons.join('; ')})`)
          .join(', ')}.`;
  const advisoryNote =
    transcript.advisory?.length > 0
      ? ` Not runner-enforced (advisory): ${transcript.advisory.join('; ')}.`
      : '';
  const guardrails = {
    pass: blocked.length === 0,
    score: blocked.length === 0 ? 1 : 0,
    reason: guardrailVerdict + advisoryNote,
  };

  const pass = outcome.pass && evidence.pass && guardrails.pass;
  let reason;
  if (pass) {
    reason = 'Intent satisfied with required evidence and no guardrail violations';
  } else if (outcome.pass && !evidence.pass && guardrails.pass) {
    reason = `Tools succeeded and outcome criteria were met, but intent is not satisfied. ${evidence.reason}`;
  } else {
    reason = [
      outcome.pass ? null : outcome.reason,
      evidence.pass ? null : evidence.reason,
      guardrails.pass ? null : guardrailVerdict,
    ]
      .filter(Boolean)
      .join(' ');
  }

  return {
    pass,
    score: pass ? 1 : 0,
    reason,
    namedScores: {
      outcome: outcome.score,
      evidence: evidence.score,
      guardrails: guardrails.score,
    },
    componentResults: [outcome, evidence, guardrails],
  };
}

/**
 * Promptfoo javascript assertion: `value: file://cige.mjs:assertIntent`.
 */
export function assertIntent(output, context) {
  const transcript = typeof output === 'string' ? JSON.parse(output) : output;
  return gradeCige(context.vars.cige, transcript);
}
