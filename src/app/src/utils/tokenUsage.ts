interface TokenUsageBreakdown {
  prompt?: number;
  completion?: number;
  total?: number;
}

export function getTokenUsageTotal(usage: TokenUsageBreakdown | undefined): number {
  return usage?.total ?? (usage?.prompt ?? 0) + (usage?.completion ?? 0);
}

export function getPrimaryTokenUsageLabel(isRedteam: boolean): 'Provider' | 'Target' {
  return isRedteam ? 'Target' : 'Provider';
}
