import { createAppTheme } from '@app/components/PageShell';
import { Severity } from '@promptfoo/redteam/constants';
import { getProgressColor, getSeverityColor } from './color';

describe('getSeverityColor', () => {
  const theme = createAppTheme(false);

  it.each([
    {
      severity: Severity.Critical,
      expectedColor: theme.palette.custom.severity[Severity.Critical].main,
    },
    { severity: Severity.High, expectedColor: theme.palette.custom.severity[Severity.High].main },
    { severity: Severity.Medium, expectedColor: theme.palette.warning.main },
    { severity: Severity.Low, expectedColor: theme.palette.success.main },
    { severity: undefined, expectedColor: theme.palette.grey[500] },
    { severity: 'invalid-severity' as Severity, expectedColor: theme.palette.grey[500] },
    { severity: null as any, expectedColor: theme.palette.grey[500] },
    { severity: 5 as unknown as Severity, expectedColor: theme.palette.grey[500] },
  ])(
    'should return $expectedColor when given $severity as input',
    ({ severity, expectedColor }) => {
      const result = getSeverityColor(severity, theme);

      expect(result).toBe(expectedColor);
    },
  );
});

describe('getProgressColor', () => {
  describe('when forAttackRate is false (pass rate)', () => {
    const theme = createAppTheme(false);
    const darkTheme = createAppTheme(true);
    it.each([
      { percentage: 95, expectedColor: darkTheme.palette.success.main, dark: true },
      { percentage: 80, expectedColor: darkTheme.palette.success.main, dark: true },
      { percentage: 75, expectedColor: darkTheme.palette.warning.light, dark: true },
      { percentage: 60, expectedColor: darkTheme.palette.warning.light, dark: true },
      { percentage: 30, expectedColor: darkTheme.palette.warning.dark, dark: true },
      { percentage: 25, expectedColor: darkTheme.palette.error.main, dark: true },
      {
        percentage: 10,
        expectedColor: darkTheme.palette.custom.severity[Severity.Critical].main,
        dark: true,
      },
    ])(
      'should return $expectedColor for a pass rate percentage of $percentage',
      ({ percentage, expectedColor, dark }) => {
        const result = getProgressColor(percentage, dark ? darkTheme : theme, false);

        expect(result).toBe(expectedColor);
      },
    );
  });

  describe('when forAttackRate is true (attack success rate)', () => {
    const theme = createAppTheme(false);
    it.each([
      { percentage: 80, expectedColor: theme.palette.custom.severity[Severity.High].main },
      { percentage: 60, expectedColor: theme.palette.warning.dark },
      { percentage: 30, expectedColor: theme.palette.warning.light },
      { percentage: 15, expectedColor: theme.palette.success.main },
      { percentage: 5, expectedColor: theme.palette.success.main },
    ])(
      'should return $expectedColor for an attack success rate percentage of $percentage',
      ({ percentage, expectedColor }) => {
        const result = getProgressColor(percentage, theme, true);

        expect(result).toBe(expectedColor);
      },
    );
  });
});
