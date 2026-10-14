import { Severity } from '@promptfoo/redteam/constants';
import { describe, expect, it } from 'vitest';
import { getSeverityColor } from './color';

describe('getSeverityColor', () => {
  it.each([
    { severity: Severity.Critical, expected: 'hsl(var(--severity-critical))' },
    { severity: Severity.High, expected: 'hsl(var(--severity-high))' },
    { severity: Severity.Medium, expected: 'hsl(var(--severity-medium))' },
    { severity: Severity.Low, expected: 'hsl(var(--severity-low))' },
    { severity: Severity.Informational, expected: 'hsl(var(--severity-informational))' },
  ])('should return CSS variable for $severity', ({ severity, expected }) => {
    const result = getSeverityColor(severity);
    expect(result).toBe(expected);
  });

  it('should return fallback color for unknown severity', () => {
    const result = getSeverityColor('invalid-severity' as Severity);
    expect(result).toBe('hsl(var(--muted-foreground))');
  });
});
