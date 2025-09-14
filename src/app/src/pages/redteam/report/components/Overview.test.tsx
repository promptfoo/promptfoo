import React from 'react';

import { createTheme, ThemeProvider } from '@mui/material/styles';
import { GridLogicOperator, GridFilterModel } from '@mui/x-data-grid';
import { Severity, severityDisplayNames } from '@promptfoo/redteam/constants';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Overview from './Overview';
import { useReportStore } from './store';
import type { RedteamPluginObject } from '@promptfoo/redteam/types';

vi.mock('./store', () => ({
  useReportStore: vi.fn(),
}));

describe('Overview', () => {
  const mockedUseReportStore = vi.mocked(useReportStore);
  const defaultTheme = createTheme();
  const darkTheme = createTheme({ palette: { mode: 'dark' } });
  const mockSetFilterModel = vi.fn<(filterModel: GridFilterModel) => void>();
  const mockRef: React.MutableRefObject<HTMLDivElement | null> = { current: null };

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
        <Overview
          categoryStats={categoryStats}
          plugins={plugins}
          vulnerabilitiesDataGridRef={mockRef}
          setVulnerabilitiesDataGridFilterModel={mockSetFilterModel}
        />
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

  it('should handle plugins referencing categories not in categoryStats', () => {
    mockedUseReportStore.mockReturnValue({
      pluginPassRateThreshold: 0.5,
      setPluginPassRateThreshold: vi.fn(),
      showPercentagesOnRiskCards: false,
      setShowPercentagesOnRiskCards: vi.fn(),
    });

    const categoryStats = {
      'existing-category': { pass: 0, total: 10 },
    };

    const plugins: RedteamPluginObject[] = [
      { id: 'existing-category', severity: Severity.Critical },
      { id: 'missing-category', severity: Severity.High },
    ];

    renderOverview(categoryStats, plugins);

    expectSeverityCardToHaveCount(Severity.Critical, '1');
    expectSeverityCardToHaveCount(Severity.High, '0');
    expectSeverityCardToHaveCount(Severity.Medium, '0');
    expectSeverityCardToHaveCount(Severity.Low, '0');
  });

  it('should correctly update the filter when different severity cards are clicked in succession', () => {
    const categoryStats = {
      plugin1: { pass: 0, total: 1 },
      plugin2: { pass: 0, total: 1 },
      plugin3: { pass: 0, total: 1 },
    };

    const plugins: RedteamPluginObject[] = [
      { id: 'plugin1', severity: Severity.Critical },
      { id: 'plugin2', severity: Severity.High },
      { id: 'plugin3', severity: Severity.Medium },
    ];

    const mockElement = document.createElement('div');
    mockElement.scrollIntoView = vi.fn();
    mockRef.current = mockElement;

    renderOverview(categoryStats, plugins);

    const criticalCard = screen
      .getByText(severityDisplayNames[Severity.Critical])
      .closest('.MuiCardContent-root');
    const highCard = screen
      .getByText(severityDisplayNames[Severity.High])
      .closest('.MuiCardContent-root');
    const mediumCard = screen
      .getByText(severityDisplayNames[Severity.Medium])
      .closest('.MuiCardContent-root');

    fireEvent.click(criticalCard!);
    expect(mockSetFilterModel).toHaveBeenCalledWith({
      items: [
        {
          field: 'severity',
          operator: 'is',
          value: Severity.Critical,
        },
      ],
      logicOperator: GridLogicOperator.Or,
    });

    fireEvent.click(highCard!);
    expect(mockSetFilterModel).toHaveBeenCalledWith({
      items: [
        {
          field: 'severity',
          operator: 'is',
          value: Severity.High,
        },
      ],
      logicOperator: GridLogicOperator.Or,
    });

    fireEvent.click(mediumCard!);
    expect(mockSetFilterModel).toHaveBeenCalledWith({
      items: [
        {
          field: 'severity',
          operator: 'is',
          value: Severity.Medium,
        },
      ],
      logicOperator: GridLogicOperator.Or,
    });
  });

  it('should call setVulnerabilitiesDataGridFilterModel with correct filter when severity card is clicked and showPercentagesOnRiskCards is true', () => {
    mockedUseReportStore.mockReturnValue({
      pluginPassRateThreshold: 0.8,
      setPluginPassRateThreshold: vi.fn(),
      showPercentagesOnRiskCards: true,
      setShowPercentagesOnRiskCards: vi.fn(),
    });

    const categoryStats = {
      plugin1: { pass: 1, total: 10 },
    };

    const plugins: RedteamPluginObject[] = [{ id: 'plugin1', severity: Severity.Critical }];

    // Create a mock element with scrollIntoView
    const mockElement = document.createElement('div');
    mockElement.scrollIntoView = vi.fn();
    mockRef.current = mockElement;

    renderOverview(categoryStats, plugins);

    // Find and click the Critical severity card
    const criticalCard = screen
      .getByText(severityDisplayNames[Severity.Critical])
      .closest('.MuiCardContent-root');
    fireEvent.click(criticalCard!);

    // Check that setVulnerabilitiesDataGridFilterModel was called with correct filter
    expect(mockSetFilterModel).toHaveBeenCalledWith({
      items: [
        {
          field: 'severity',
          operator: 'is',
          value: Severity.Critical,
        },
      ],
      logicOperator: GridLogicOperator.Or,
    });

    // Check that scrollIntoView was called
    expect(mockElement.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
  });

  it('should handle click on severity cards with null ref gracefully', () => {
    const categoryStats = {
      plugin1: { pass: 0, total: 1 },
    };

    const plugins: RedteamPluginObject[] = [{ id: 'plugin1', severity: Severity.High }];

    // Ensure ref is null
    mockRef.current = null;

    renderOverview(categoryStats, plugins);

    // Find and click the High severity card
    const highCard = screen
      .getByText(severityDisplayNames[Severity.High])
      .closest('.MuiCardContent-root');

    // This should not throw an error even with null ref
    expect(() => fireEvent.click(highCard!)).not.toThrow();

    // Filter should still be set
    expect(mockSetFilterModel).toHaveBeenCalledWith({
      items: [
        {
          field: 'severity',
          operator: 'is',
          value: Severity.High,
        },
      ],
      logicOperator: GridLogicOperator.Or,
    });
  });
});
