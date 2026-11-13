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
