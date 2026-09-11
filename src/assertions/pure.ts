import { pureAssertionRegistry } from './pureRegistry';
import { pureInverseAssertionBaseTypes } from './pureTypes';

import type { PureAssertionParams } from './pureRegistry';
import type { PureAssertionType } from './pureTypes';

export interface PureAssertion {
  type: PureAssertionType;
  value?: unknown;
  threshold?: number;
  weight?: number;
}

export interface PureGradingResult {
  pass: boolean;
  score: number;
  reason: string;
  assertion: PureAssertion;
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

export async function runPureAssertion({
  assertion,
  providerResponse,
  latencyMs,
  prompt,
}: RunPureAssertionOptions): Promise<PureGradingResult> {
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
  return { ...result, assertion, ...(assertion.weight === 0 ? { pass: true } : {}) };
}

export type { PureAssertionType } from './pureTypes';
