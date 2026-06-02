import type { VarValue } from './shared.js';

export interface FunctionToolCallValidator {
  validateFunctionToolCall(output: string | object, vars?: Record<string, VarValue>): void;
}

export function hasFunctionToolCallValidator(
  provider: unknown,
): provider is FunctionToolCallValidator {
  return (
    typeof provider === 'object' &&
    provider !== null &&
    'validateFunctionToolCall' in provider &&
    typeof provider.validateFunctionToolCall === 'function'
  );
}
