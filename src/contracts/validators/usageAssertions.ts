export interface TokenBudget {
  min?: number;
  max?: number;
}

export function tokenBudgetError(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 'Enter a token budget object with min or max.';
  }
  const budget = value as Record<string, unknown>;
  if (Object.keys(budget).some((key) => key !== 'min' && key !== 'max')) {
    return 'Token budgets accept only min and max; usage comes from the provider response.';
  }
  if (budget.min === undefined && budget.max === undefined) {
    return 'Set at least one token budget bound: min or max.';
  }
  for (const key of ['min', 'max'] as const) {
    if (
      budget[key] !== undefined &&
      (!Number.isSafeInteger(budget[key]) || (budget[key] as number) < 0)
    ) {
      return 'Token budget bounds must be non-negative safe integers.';
    }
  }
  if (
    budget.min !== undefined &&
    budget.max !== undefined &&
    (budget.min as number) > (budget.max as number)
  ) {
    return 'Token budget min must not exceed max.';
  }
  return undefined;
}

export function toolSetError(value: unknown): string | undefined {
  if (
    !Array.isArray(value) ||
    value.some((name) => typeof name !== 'string' || name.trim().length === 0)
  ) {
    return 'Enter an array of tool names. Use [] to require no tool calls.';
  }
  return undefined;
}
