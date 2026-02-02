import { Severity } from '@promptfoo/redteam/constants';

// Severity colors using CSS custom properties (defined in index.css)
const severityColors: Record<Severity, string> = {
  [Severity.Critical]: 'hsl(var(--severity-critical))',
  [Severity.High]: 'hsl(var(--severity-high))',
  [Severity.Medium]: 'hsl(var(--severity-medium))',
  [Severity.Low]: 'hsl(var(--severity-low))',
  [Severity.Informational]: 'hsl(var(--severity-informational))',
};

export const getSeverityColor = (severity: Severity): string =>
  severityColors[severity] || 'hsl(var(--muted-foreground))';

export const getProgressColor = (percentage: number, highIsBad: boolean = false): string => {
  const evalPercentage = highIsBad ? percentage : 100 - percentage;
  if (evalPercentage >= 90) {
    return severityColors[Severity.Critical];
  }
  if (evalPercentage >= 75) {
    return severityColors[Severity.High];
  }
  if (evalPercentage >= 50) {
    return 'hsl(25 95% 45%)'; // warning-dark equivalent
  }
  if (evalPercentage >= 25) {
    return 'hsl(25 95% 60%)'; // warning-light equivalent
  }
  return severityColors[Severity.Low];
};
