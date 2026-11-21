import { AsyncLocalStorage } from 'node:async_hooks';

import { marked } from 'marked';
import { type DefaultTreeAdapterMap, parseFragment } from 'parse5';
import { hasPrivateMedia } from './redactionMedia';
import {
  getAssertionLeaves,
  projectRedactionResult,
  requiresTraceRedaction,
  sanitizeCodingAgentVerifierInputs,
} from './verifierPrivacy';

import type {
  Assertion,
  AtomicTestCase,
  CallApiContextParams,
  GradingResult,
  ProviderResponse,
} from '../types';

export {
  configRequiresTraceRedaction,
  getAssertionLeaves,
  REDACTED_PROMPT,
  requiresTraceRedaction,
  sanitizeRedactionGrade,
  sanitizeRedactionPrompt,
  TRACE_REDACTION_ASSERTIONS,
} from './verifierPrivacy';

export type VerifierReceipt = {
  location: string;
  sourcePath?: string;
  value: string;
};

export type ProtectedPlan = { value: Assertion['value'] } | { error: unknown; missing?: boolean };

export const protectedReceiptScope = new AsyncLocalStorage<{
  receipts: Map<string, VerifierReceipt[]>;
  receiptPaths: Map<string, string>;
  plans?: Map<string, ProtectedPlan>;
  assertionValues: Map<Assertion, ProtectedPlan>;
}>();

export function getProtectedAssertionValue(assertion: Assertion): Assertion['value'] {
  const captured = protectedReceiptScope.getStore()?.assertionValues.get(assertion);
  if (!captured) {
    return assertion.value;
  }
  if ('error' in captured) {
    throw captured.error;
  }
  return captured.value;
}

// Snapshots may have been deleted or overwritten by the target. Never reopen them.
export function getCapturedVerifierInputs(test: AtomicTestCase) {
  const scope = protectedReceiptScope.getStore();
  if (!scope) {
    return undefined;
  }
  const captured = getAssertionLeaves(test.assert).map((assertion) =>
    scope.assertionValues.get(assertion),
  );
  return {
    id: 'coding-agent:trace-redaction',
    canaries: Array.from(scope.receipts.values(), (items) => items.map((item) => item.value)),
    values: captured.map((entry) => (entry && 'value' in entry ? entry.value : undefined)),
  };
}

// Strategies clone the outer test while replacing turn variables. The assertion
// list keeps its identity, so no private references need to travel in a request.
const localStrategyTests = new WeakMap<NonNullable<AtomicTestCase['assert']>, AtomicTestCase>();

export function getLocalStrategyTest(test: AtomicTestCase): AtomicTestCase {
  return (test.assert && localStrategyTests.get(test.assert)) ?? test;
}

export function getStrategyContext(context: CallApiContextParams): CallApiContextParams {
  const test: AtomicTestCase | undefined = context.test;
  if (!test?.assert || !requiresTraceRedaction(test.assert)) {
    return context;
  }
  const safe = getPrivateTargetContext(context);
  const projected: AtomicTestCase | undefined = safe.test;
  if (!projected?.assert || !requiresTraceRedaction(projected.assert)) {
    throw new Error('Private strategy inputs could not be projected');
  }
  localStrategyTests.set(projected.assert, getLocalStrategyTest(test));
  return { ...safe, originalProvider: context.originalProvider };
}

/** Legacy strategies accept a test either separately or inside the provider context. */
export function getPrivateIterationContext(
  context: CallApiContextParams | undefined,
  input: Pick<CallApiContextParams, 'vars' | 'prompt' | 'test'>,
): CallApiContextParams | undefined {
  const delegated: AtomicTestCase | undefined = context?.test;
  const test: AtomicTestCase | undefined = input.test ?? delegated;
  if (test !== delegated && requiresTraceRedaction(delegated?.assert)) {
    throw new Error('Conflicting private strategy tests');
  }
  return requiresTraceRedaction(test?.assert)
    ? getStrategyContext({ ...context, ...input, test })
    : undefined;
}

/** The rendered task is target input. Local verification controls in its context are not. */
export function getPrivateTargetContext(context: CallApiContextParams): CallApiContextParams {
  const { filters, getCache, logger, originalProvider: _provider, ...input } = context;
  // Mark the entire context as verifier-owned. A hook or strategy may add a
  // private variable that doesn't occur in test.vars or the assertion.
  const test = context.test && getLocalStrategyTest(context.test);
  const { data } = sanitizeCodingAgentVerifierInputs(
    { id: 'coding-agent:trace-redaction', data: input },
    {
      preservePaths: false,
      strict: true,
      source: test && { test, captured: getCapturedVerifierInputs(test) },
    },
  );
  if (!data?.vars || !data.prompt || !data.test) {
    throw new Error('Private target inputs could not be projected');
  }
  return { ...data, filters, getCache, logger, bustCache: true };
}

/** Model graders only see public inputs after local verification. */
export function sanitizeRedactionGradingInputs<TArgs extends unknown[]>(
  type: string,
  test: AtomicTestCase & { gradingArguments?: TArgs },
  value: Assertion['value'],
) {
  const local = getLocalStrategyTest(test);
  const assert = getAssertionLeaves(test.assert).map(({ type }) => ({ type }));
  const publicTest = {
    assert,
    options: test.options,
    metadata: { purpose: 'Assess the public report.' },
    gradingArguments: test.gradingArguments,
  };
  return sanitizeCodingAgentVerifierInputs(
    { type, assert, test: publicTest, value },
    {
      preservePaths: false,
      strict: true,
      source: {
        type,
        assert: local.assert,
        vars: local.vars,
        metadata: local.metadata,
        captured: getCapturedVerifierInputs(local),
      },
    },
  );
}

// Module-local identity. A target cannot authorize its own grade using Symbol.for or JSON.
export const TRUSTED_REDACTION_GRADER = Symbol('promptfoo.trustedRedactionGrader');

/** Inversion applies to verified outcomes only. */
export function getRedactionOutcome(
  grade: GradingResult,
  inverse = grade.assertion?.type.startsWith('not-') === true,
) {
  const incomplete = Boolean(
    grade.metadata?.graderError ||
      grade.metadata?.gradingError ||
      grade.metadata?.gradingIncomplete ||
      grade.metadata?.codingAgentExploitStatus === 'evidence_missing',
  );
  return { incomplete, pass: !incomplete && (inverse ? !grade.pass : grade.pass) };
}

function hasMarkdownImage(text: string): boolean {
  if (!text.includes('![')) {
    return false;
  }
  if (text.length > 1024 * 1024) {
    return true;
  }
  try {
    let hasImage = false;
    // walkTokens returns the results of this synchronous visitor.
    void marked.walkTokens(marked.lexer(text), (token) => {
      hasImage ||= token.type === 'image';
    });
    return hasImage;
  } catch {
    // If Markdown cannot be inspected, the privacy check cannot accept its media.
    return true;
  }
}

function hasHtmlMedia(text: string): boolean {
  if (!/<[a-z]/i.test(text)) {
    return false;
  }
  if (text.length > 1024 * 1024) {
    return true;
  }
  const pending: DefaultTreeAdapterMap['node'][] = [parseFragment(text)];
  while (pending.length) {
    const node = pending.pop()!;
    if ('tagName' in node) {
      if (
        node.tagName === 'script' ||
        node.tagName === 'iframe' ||
        node.attrs.some(
          ({ name, value }) =>
            /^on[a-z]/i.test(name) ||
            name === 'srcdoc' ||
            /^javascript:/i.test(value.replace(/\s/g, '')),
        ) ||
        (node.tagName === 'input' &&
          node.attrs.some(
            ({ name, value }) => name === 'type' && value.toLowerCase() === 'image',
          )) ||
        (node.tagName === 'link' &&
          node.attrs.some(
            ({ name, value }) =>
              name === 'rel' && value.toLowerCase().split(/\s+/).includes('stylesheet'),
          ))
      ) {
        return true;
      }
      const styles = node.attrs.filter(({ name }) => name === 'style').map(({ value }) => value);
      if (node.tagName === 'style') {
        styles.push(node.childNodes.map((child) => ('value' in child ? child.value : '')).join(''));
      }
      // Escaped CSS can hide loaded media. Quoted comment markers may be literal text,
      // so inspect that CSS conservatively instead of stripping apparent comments.
      if (
        styles.some((style) =>
          /\\|\b(?:url|image|(?:-webkit-)?image-set)\s*\(|@import\b/i.test(
            /["']/.test(style) ? style : style.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, ''),
          ),
        )
      ) {
        return true;
      }
    }
    if ('childNodes' in node) {
      for (const child of node.childNodes) {
        pending.push(child);
      }
    }
  }
  return false;
}

export function hasRedactionMedia(response: ProviderResponse | null | undefined): boolean {
  return hasPrivateMedia(response, (text) => hasHtmlMedia(text) || hasMarkdownImage(text));
}

export function sanitizeRedactionResult<T extends object>(input: T): T {
  return projectRedactionResult(input, hasRedactionMedia, getCapturedVerifierInputs);
}
