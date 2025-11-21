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
  ])('should return $expectedColor when given $severity as input', ({
    severity,
    expectedColor,
  }) => {
    const result = getSeverityColor(severity, theme);

    expect(result).toBe(expectedColor);
  });
});

describe('getProgressColor', () => {
  describe('when percentage is greater than 100', () => {
    const theme = createAppTheme(false);

    it('should return the color for Severity.Low when forAttackRate is false', () => {
      const percentage = 110;
      const expectedColor = getSeverityColor(Severity.Low, theme);
      const result = getProgressColor(percentage, theme, false);

      expect(result).toBe(expectedColor);
    });

    it('should return the color for Severity.Critical when forAttackRate is true', () => {
      const percentage = 110;
      const expectedColor = getSeverityColor(Severity.Critical, theme);
      const result = getProgressColor(percentage, theme, true);

      expect(result).toBe(expectedColor);
    });
  });

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
      {
        percentage: 25,
        expectedColor: theme.palette.custom.severity[Severity.High].main,
        dark: false,
      },
      { percentage: 50, expectedColor: theme.palette.warning.dark, dark: false },
      { percentage: 75, expectedColor: theme.palette.warning.light, dark: false },
      { percentage: 90, expectedColor: theme.palette.success.main, dark: false },
    ])('should return $expectedColor for a pass rate percentage of $percentage', ({
      percentage,
      expectedColor,
      dark,
    }) => {
      const result = getProgressColor(percentage, dark ? darkTheme : theme, false);

      expect(result).toBe(expectedColor);
    });

    it('should return the highest severity color for negative percentages', () => {
      const result = getProgressColor(-10, theme, false);
      expect(result).toBe(getSeverityColor(Severity.Critical, theme));
    });
  });

  describe('when highIsBad is true (e.g. attack success rate)', () => {
    const theme = createAppTheme(false);
    it.each([
      { percentage: 80, expectedColor: theme.palette.custom.severity[Severity.High].main },
      { percentage: 60, expectedColor: theme.palette.warning.dark },
      { percentage: 30, expectedColor: theme.palette.warning.light },
      { percentage: 15, expectedColor: theme.palette.success.main },
      { percentage: 5, expectedColor: theme.palette.success.main },
      { percentage: 25, expectedColor: theme.palette.warning.light },
      { percentage: 50, expectedColor: theme.palette.warning.dark },
      { percentage: 75, expectedColor: theme.palette.custom.severity[Severity.High].main },
      { percentage: 90, expectedColor: theme.palette.custom.severity[Severity.Critical].main },
    ])('should return $expectedColor for an attack success rate percentage of $percentage', ({
      percentage,
      expectedColor,
    }) => {
      const result = getProgressColor(percentage, theme, true);

      expect(result).toBe(expectedColor);
    });

    it('should return low severity color for negative percentages', () => {
      const result = getProgressColor(-10, theme, true);
      expect(result).toBe(getSeverityColor(Severity.Low, theme));
    });
  });

  it('should handle NaN percentage values gracefully', () => {
    const theme = createAppTheme(false);
    const expectedColor = getSeverityColor(Severity.Low, theme);
    const result = getProgressColor(NaN, theme, false);
    expect(result).toBe(expectedColor);
  });
});

describe('createAppTheme', () => {
  it("should return a theme object with palette.mode set to 'light' when called with darkMode=false", () => {
    const theme = createAppTheme(false);
    expect(theme.palette.mode).toBe('light');
  });

  it("should return a theme object with palette.mode set to 'dark' when called with darkMode=true", () => {
    const theme = createAppTheme(true);
    expect(theme.palette.mode).toBe('dark');
  });

  it('should set palette.custom.darkOverlay and palette.custom.lightOverlay to the correct rgba values when darkMode is true', () => {
    const theme = createAppTheme(true);
    expect(theme.palette.custom.darkOverlay).toBe('rgba(255, 255, 255, 0.05)');
    expect(theme.palette.custom.lightOverlay).toBe('rgba(255, 255, 255, 0.1)');
  });

  it('should set palette.custom.darkOverlay and palette.custom.lightOverlay to the correct rgba values when darkMode is false', () => {
    const theme = createAppTheme(false);
    expect(theme.palette.custom.darkOverlay).toBe('rgba(0, 0, 0, 0.03)');
    expect(theme.palette.custom.lightOverlay).toBe('rgba(0, 0, 0, 0.05)');
  });

  it('should include styleOverrides for MuiButton, MuiCard, and MuiTableContainer in the returned theme object', () => {
    const theme = createAppTheme(false);

    expect(theme.components).toHaveProperty('MuiButton');
    expect(theme.components).toHaveProperty('MuiCard');
    expect(theme.components).toHaveProperty('MuiTableContainer');
  });

  it('should include a palette.custom.severity object with keys for critical, high, medium, and low', () => {
    const theme = createAppTheme(false);
    expect(theme.palette.custom.severity).toBeDefined();
    expect(theme.palette.custom.severity.critical).toBeDefined();
    expect(theme.palette.custom.severity.high).toBeDefined();
    expect(theme.palette.custom.severity.medium).toBeDefined();
    expect(theme.palette.custom.severity.low).toBeDefined();
  });
});
