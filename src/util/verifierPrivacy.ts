import { hasPrivateMedia } from './redactionMedia';
import { snapshotResultProviderRefs } from './sanitizer';
import {
  configHasCodingAgentVerifier,
  configRequiresTraceRedaction,
  projectPrivateResult,
  sanitizeCodingAgentVerifierInputs,
} from './verifierRedaction';

import type { AtomicTestCase, EvaluateResult, ProviderResponse } from '../types';

export {
  configHasCodingAgentVerifier,
  configRequiresTraceRedaction,
  getAssertionLeaves,
  isPrivateVerifierField,
  REDACTED_PROMPT,
  requiresTraceRedaction,
  sanitizeCodingAgentVerifierInputs,
  sanitizeRedactionGrade,
  sanitizeRedactionPrompt,
  TRACE_REDACTION_ASSERTIONS,
} from './verifierRedaction';

/** Only non-private rows retain grading references. Never invoke live provider methods on private rows. */
export function projectRedactionResult<T extends object>(
  input: T,
  hasMedia: (response: ProviderResponse) => boolean,
  localInputs?: (test: AtomicTestCase) => unknown,
): T {
  if (!configHasCodingAgentVerifier(input)) {
    return input;
  }
  if (configRequiresTraceRedaction(input)) {
    return projectPrivateResult(input, hasMedia, localInputs);
  }
  const { response, ...fields } = input as Partial<EvaluateResult>;
  const refs = snapshotResultProviderRefs(fields);
  return { ...sanitizeCodingAgentVerifierInputs(refs), ...(response && { response }) } as T;
}

export function sanitizeRedactionResult<T extends object>(input: T): T {
  return projectRedactionResult(input, hasPrivateMedia);
}
