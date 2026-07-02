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

const numberFormatCache = new Map<string, Intl.NumberFormat>();

function getNumberFormatter(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(options);
  const cached = numberFormatCache.get(key);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.NumberFormat(undefined, options);
  numberFormatCache.set(key, formatter);
  return formatter;
}

export function getCostDisplayValue(costUsd: number, unit: CostDisplayUnit): number {
  return unit === 'cents' ? costUsd * 100 : costUsd;
}

export function formatUsdCost(
  costUsd: number,
  unit: CostDisplayUnit,
  options: Intl.NumberFormatOptions = DEFAULT_COST_FORMAT_OPTIONS,
): string {
  const displayCost = getNumberFormatter(options).format(getCostDisplayValue(costUsd, unit));

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
  return `${getNumberFormatter(RUNS_FORMAT_OPTIONS).format(runs)} runs/${denominator}`;
}
