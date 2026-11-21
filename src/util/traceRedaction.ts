import { AsyncLocalStorage } from 'node:async_hooks';

import { marked } from 'marked';
import { type DefaultTreeAdapterMap, parseFragment } from 'parse5';
import { hasPrivateMedia } from './redactionMedia';
import {
  getAssertionLeaves,
  projectRedactionResult,
  sanitizeCodingAgentVerifierInputs,
} from './verifierPrivacy';

import type { Assertion, AtomicTestCase, ProviderResponse } from '../types';

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

/** Model graders only see public inputs after local verification. */
export function sanitizeRedactionGradingInputs<TArgs extends unknown[]>(
  type: string,
  test: AtomicTestCase & { gradingArguments?: TArgs },
  value: Assertion['value'],
) {
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
        assert: test.assert,
        vars: test.vars,
        metadata: test.metadata,
        captured: getCapturedVerifierInputs(test),
      },
    },
  );
}

// Module-local identity. A target cannot authorize its own grade using Symbol.for or JSON.
export const TRUSTED_REDACTION_GRADER = Symbol('promptfoo.trustedRedactionGrader');

function hasMarkdownImage(text: string): boolean {
  if (!text.includes('![')) {
    return false;
  }
  if (text.length > 1024 * 1024) {
    return true;
  }
  try {
    let hasImage = false;
    marked.walkTokens(marked.lexer(text), (token) => {
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
