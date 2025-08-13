import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import Overview from './Overview';
import { useReportStore } from './store';
import { Severity, severityDisplayNames } from '@promptfoo/redteam/constants';
import type { RedteamPluginObject } from '@promptfoo/redteam/types';

vi.mock('./store', () => ({
  useReportStore: vi.fn(),
}));

describe('Overview', () => {
  const mockedUseReportStore = vi.mocked(useReportStore);
  const defaultTheme = createTheme();
  const darkTheme = createTheme({ palette: { mode: 'dark' } });

  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseReportStore.mockReturnValue({
      pluginPassRateThreshold: 1.0,
      setPluginPassRateThreshold: vi.fn(),
      showPercentagesOnRiskCards: false,
      setShowPercentagesOnRiskCards: vi.fn(),
    });
  });

  const renderOverview = (
    categoryStats: any,
    plugins: RedteamPluginObject[],
    theme = defaultTheme,
  ) => {
    return render(
      <ThemeProvider theme={theme}>
        <Overview categoryStats={categoryStats} plugins={plugins} />
      </ThemeProvider>,
    );
  };

  const expectSeverityCardToHaveCount = (severity: Severity, expectedCount: string) => {
    const card = screen.getByText(severityDisplayNames[severity]).closest('.MuiCardContent-root');
    expect(card).toHaveTextContent(expectedCount);
  };

  it('should display zero issues for all severities when categoryStats is empty', () => {
    const categoryStats = {};
    const plugins: RedteamPluginObject[] = [];

    renderOverview(categoryStats, plugins);

    Object.values(Severity).forEach((severity) => {
      expectSeverityCardToHaveCount(severity, '0');
    });
  });

  it('should display the correct issue counts for each severity when pass rates are below the threshold', () => {
    mockedUseReportStore.mockReturnValue({
      pluginPassRateThreshold: 0.8,
      setPluginPassRateThreshold: vi.fn(),
      showPercentagesOnRiskCards: false,
      setShowPercentagesOnRiskCards: vi.fn(),
    });

    const categoryStats = {
      'critical-fail': { pass: 1, total: 10 },
      'critical-pass': { pass: 9, total: 10 },
      'high-fail-1': { pass: 5, total: 10 },
      'high-fail-2': { pass: 0, total: 5 },
      'medium-fail': { pass: 7, total: 10 },
      'low-pass': { pass: 10, total: 10 },
    };

    const plugins: RedteamPluginObject[] = [
      { id: 'critical-fail', severity: Severity.Critical },
      { id: 'critical-pass', severity: Severity.Critical },
      { id: 'high-fail-1', severity: Severity.High },
      { id: 'high-fail-2', severity: Severity.High },
      { id: 'medium-fail', severity: Severity.Medium },
      { id: 'low-pass', severity: Severity.Low },
    ];

    renderOverview(categoryStats, plugins);

    expectSeverityCardToHaveCount(Severity.Critical, '1');
    expectSeverityCardToHaveCount(Severity.High, '2');
    expectSeverityCardToHaveCount(Severity.Medium, '1');
    expectSeverityCardToHaveCount(Severity.Low, '0');
  });

  it('should handle category with zero total tests without error', () => {
    mockedUseReportStore.mockReturnValue({
      pluginPassRateThreshold: 0.5,
      setPluginPassRateThreshold: vi.fn(),
      showPercentagesOnRiskCards: false,
      setShowPercentagesOnRiskCards: vi.fn(),
    });

    const categoryStats = {
      'zero-total': { pass: 0, total: 0 },
    };

    const plugins: RedteamPluginObject[] = [{ id: 'zero-total', severity: Severity.Critical }];

    renderOverview(categoryStats, plugins);

    expectSeverityCardToHaveCount(Severity.Critical, '0');
  });

  it('should display zero issue counts for all severities when plugins array is empty but categoryStats contains data', () => {
    const categoryStats = {
      plugin1: { pass: 5, total: 10 },
      plugin2: { pass: 3, total: 7 },
    };
    const plugins: RedteamPluginObject[] = [];

    renderOverview(categoryStats, plugins);

    Object.values(Severity).forEach((severity) => {
      expectSeverityCardToHaveCount(severity, '0');
    });
  });

  it('should handle missing severity mappings gracefully', () => {
    const categoryStats = {
      'known-category': { pass: 0, total: 10 },
      'unknown-category': { pass: 5, total: 10 },
    };

    const plugins: RedteamPluginObject[] = [{ id: 'known-category', severity: Severity.Critical }];

    renderOverview(categoryStats, plugins);

    expectSeverityCardToHaveCount(Severity.Critical, '1');
    expectSeverityCardToHaveCount(Severity.High, '0');
    expectSeverityCardToHaveCount(Severity.Medium, '0');
    expectSeverityCardToHaveCount(Severity.Low, '0');
  });

  it('should render the correct display names for each severity card using severityDisplayNames', () => {
    const categoryStats = {
      plugin1: { pass: 0, total: 1 },
      plugin2: { pass: 0, total: 1 },
      plugin3: { pass: 0, total: 1 },
      plugin4: { pass: 0, total: 1 },
    };

    const plugins: RedteamPluginObject[] = [
      { id: 'plugin1', severity: Severity.Critical },
      { id: 'plugin2', severity: Severity.High },
      { id: 'plugin3', severity: Severity.Medium },
      { id: 'plugin4', severity: Severity.Low },
    ];

    renderOverview(categoryStats, plugins);

    expect(screen.getByText(severityDisplayNames[Severity.Critical])).toBeInTheDocument();
    expect(screen.getByText(severityDisplayNames[Severity.High])).toBeInTheDocument();
    expect(screen.getByText(severityDisplayNames[Severity.Medium])).toBeInTheDocument();
    expect(screen.getByText(severityDisplayNames[Severity.Low])).toBeInTheDocument();
  });

  it.each([
    {
      mode: 'light',
      theme: defaultTheme,
      styles: {
        [Severity.Critical]: { backgroundColor: '#fffafb', color: '#ff1744' },
        [Severity.High]: { backgroundColor: '#fffcfa', color: '#7a3c00' },
        [Severity.Medium]: { backgroundColor: '#fffefb', color: '#7a6a00' },
        [Severity.Low]: { backgroundColor: '#fafffc', color: '#005c2e' },
      },
    },
    {
      mode: 'dark',
      theme: darkTheme,
      styles: {
        [Severity.Critical]: { backgroundColor: '#2d1b1e', color: '#ff1744' },
        [Severity.High]: { backgroundColor: '#2d251b', color: '#ff9100' },
        [Severity.Medium]: { backgroundColor: '#2d2a1b', color: '#ffc400' },
        [Severity.Low]: { backgroundColor: '#1b2d20', color: '#00e676' },
      },
    },
  ])(
    'should apply the correct background and text colors for each severity card in $mode mode',
    ({ theme, styles }) => {
      const categoryStats = {
        plugin1: { pass: 0, total: 1 },
        plugin2: { pass: 0, total: 1 },
        plugin3: { pass: 0, total: 1 },
        plugin4: { pass: 0, total: 1 },
      };
      const plugins: RedteamPluginObject[] = [
        { id: 'plugin1', severity: Severity.Critical },
        { id: 'plugin2', severity: Severity.High },
        { id: 'plugin3', severity: Severity.Medium },
        { id: 'plugin4', severity: Severity.Low },
      ];

      renderOverview(categoryStats, plugins, theme);

      Object.values(Severity).forEach((severity) => {
        const card = screen
          .getByText(severityDisplayNames[severity])
          .closest('.MuiCardContent-root');
        expect(card).not.toBeNull();
        expect(card).toHaveStyle(styles[severity]);
      });
    },
  );
});
