interface TokenUsageBreakdown {
  prompt?: number;
  completion?: number;
  total?: number;
}

interface CategorizedTokenUsage extends TokenUsageBreakdown {
  numRequests?: number;
  attacker?: TokenUsageBreakdown;
  assertions?: TokenUsageBreakdown;
  generation?: TokenUsageBreakdown;
  incurredTokenUsage?: Omit<CategorizedTokenUsage, 'incurredTokenUsage'>;
}

export function getTokenUsageTotal(usage: TokenUsageBreakdown | undefined): number {
  return usage?.total ?? (usage?.prompt ?? 0) + (usage?.completion ?? 0);
}

/** Sum independent categories without counting target tokens twice. */
export function getCombinedTokenUsageTotal(usage: CategorizedTokenUsage | undefined): number {
  if (!usage) {
    return 0;
  }

  return (
    getTokenUsageTotal(usage) +
    getTokenUsageTotal(usage.attacker) +
    getTokenUsageTotal(usage.assertions) +
    getTokenUsageTotal(usage.generation)
  );
}

/** Return avoided response-cache work when logical and incurred usage differ. */
export function getIncurredTokenAccounting(
  usage: CategorizedTokenUsage | undefined,
): { incurredTokens: number; cachedSavings: number; actualRequests: number } | undefined {
  if (!usage?.incurredTokenUsage) {
    return undefined;
  }

  const incurredTokens = getCombinedTokenUsageTotal(usage.incurredTokenUsage);
  const cachedSavings = Math.max(getCombinedTokenUsageTotal(usage) - incurredTokens, 0);
  return cachedSavings > 0
    ? {
        incurredTokens,
        cachedSavings,
        actualRequests: usage.incurredTokenUsage.numRequests ?? 0,
      }
    : undefined;
}

export function getPrimaryTokenUsageLabel(isRedteam: boolean): 'Provider' | 'Target' {
  return isRedteam ? 'Target' : 'Provider';
}
