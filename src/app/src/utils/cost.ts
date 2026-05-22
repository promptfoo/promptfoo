export type CostDisplayUnit = 'dollars' | 'cents';

const COST_UNIT_BUDGET_USD: Record<CostDisplayUnit, number> = {
  dollars: 1,
  cents: 0.01,
};

const DEFAULT_COST_FORMAT_OPTIONS: Intl.NumberFormatOptions = {
  minimumSignificantDigits: 2,
  maximumSignificantDigits: 2,
};

const RUNS_FORMAT_OPTIONS: Intl.NumberFormatOptions = {
  maximumSignificantDigits: 3,
};

export function getCostDisplayValue(costUsd: number, unit: CostDisplayUnit): number {
  return unit === 'cents' ? costUsd * 100 : costUsd;
}

export function formatUsdCost(
  costUsd: number,
  unit: CostDisplayUnit,
  options: Intl.NumberFormatOptions = DEFAULT_COST_FORMAT_OPTIONS,
): string {
  const displayCost = Intl.NumberFormat(undefined, options).format(
    getCostDisplayValue(costUsd, unit),
  );

  return unit === 'cents' ? `${displayCost}¢` : `$${displayCost}`;
}

export function calculateRunsPerCostUnit(
  costUsd: number | undefined,
  unit: CostDisplayUnit,
): number | undefined {
  if (costUsd === undefined || !Number.isFinite(costUsd) || costUsd <= 0) {
    return undefined;
  }

  return COST_UNIT_BUDGET_USD[unit] / costUsd;
}

export function formatRunsPerCostUnit(runs: number, unit: CostDisplayUnit): string {
  const denominator = unit === 'cents' ? '1¢' : '$1';
  return `${Intl.NumberFormat(undefined, RUNS_FORMAT_OPTIONS).format(runs)} runs/${denominator}`;
}
