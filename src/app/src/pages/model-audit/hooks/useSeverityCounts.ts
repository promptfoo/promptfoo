import { useMemo } from 'react';

import { isCriticalSeverity } from '../utils';

import type { ScanIssue } from '../ModelAudit.types';

export interface SeverityCounts {
  critical: number;
  warning: number;
  info: number;
  total: number;
}

export function useSeverityCounts(issues: ScanIssue[] | undefined): SeverityCounts {
  return useMemo(() => {
    if (!issues) {
      return { critical: 0, warning: 0, info: 0, total: 0 };
    }

    const critical = issues.filter((i) => isCriticalSeverity(i.severity)).length;
    const warning = issues.filter((i) => i.severity === 'warning').length;
    const info = issues.filter((i) => i.severity === 'info' || i.severity === 'debug').length;

    return {
      critical,
      warning,
      info,
      total: critical + warning + info,
    };
  }, [issues]);
}
