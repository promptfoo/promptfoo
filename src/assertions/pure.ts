import { pureAssertionRegistry, pureInverseAssertionBaseTypes } from './pureRegistry';

import type { PureAssertionParams, PureAssertionType, PureGradingResult } from './pureRegistry';

export interface PureAssertion {
  type: PureAssertionType;
  value?: unknown;
  threshold?: number;
  weight?: number;
}

export interface PureProviderResponse {
  output: string | object;
  cost?: number;
  finishReason?: string;
  logProbs?: number[];
  metadata?: Record<string, unknown>;
}

export interface RunPureAssertionOptions {
  assertion: PureAssertion;
  providerResponse: PureProviderResponse;
  latencyMs?: number;
  prompt?: string;
}

const PURE_INVERSE_ASSERTION_TYPES = new Set<string>(pureInverseAssertionBaseTypes);

function getBaseType(type: string): string {
  if (!type.startsWith('not-')) {
    return type;
  }

  const baseType = type.slice(4);
  if (!PURE_INVERSE_ASSERTION_TYPES.has(baseType)) {
    throw new Error(`Unsupported pure inverse assertion type: ${type}`);
  }
  return baseType;
}

function hasTemplateSyntax(value: unknown, visited = new WeakSet<object>()): boolean {
  if (typeof value === 'string') {
    return value.includes('{{') || value.includes('{%') || value.includes('{#');
  }
  if (!value || typeof value !== 'object' || visited.has(value)) {
    return false;
  }

  visited.add(value);
  return Reflect.ownKeys(value)
    .filter((key) => Object.getOwnPropertyDescriptor(value, key)?.enumerable)
    .some((key) => hasTemplateSyntax(Reflect.get(value, key), visited));
}

export async function runPureAssertion({
  assertion,
  providerResponse,
  latencyMs,
  prompt,
}: RunPureAssertionOptions): Promise<PureGradingResult> {
  if (hasTemplateSyntax(assertion.value)) {
    throw new Error(
      'Pure assertion values must be fully rendered. Use runAssertion() for templated values.',
    );
  }

  const outputString =
    typeof providerResponse.output === 'string'
      ? providerResponse.output
      : JSON.stringify(providerResponse.output);
  const params = {
    assertion,
    assertionValueContext: {
      logProbs: providerResponse.logProbs,
      prompt,
      provider: undefined,
      providerResponse,
      test: {},
      vars: {},
    },
    baseType: getBaseType(assertion.type),
    cost: providerResponse.cost,
    inverse: assertion.type.startsWith('not-'),
    latencyMs,
    logProbs: providerResponse.logProbs,
    output: providerResponse.output,
    outputString,
    prompt,
    provider: undefined,
    providerResponse,
    renderedValue: assertion.value,
    test: {},
  } as PureAssertionParams;

  const result = await pureAssertionRegistry.run(params.baseType, params);
  return assertion.weight === 0 ? { ...result, pass: true } : result;
}

export { createPureAssertionRegistry, pureAssertionRegistry } from './pureRegistry';
