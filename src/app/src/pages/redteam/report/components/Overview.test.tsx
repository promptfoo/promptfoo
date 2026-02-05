import React from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
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
  const mockRef: React.MutableRefObject<HTMLDivElement | null> = { current: null };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseReportStore.mockReturnValue({
      pluginPassRateThreshold: 1.0,
      setPluginPassRateThreshold: vi.fn(),
      showPercentagesOnRiskCards: false,
      setShowPercentagesOnRiskCards: vi.fn(),
      severityFilter: null,
      setSeverityFilter: vi.fn(),
    });
  });

  const renderOverview = (categoryStats: any, plugins: RedteamPluginObject[]) => {
    return render(
      <TooltipProvider>
        <Overview
          categoryStats={categoryStats}
          plugins={plugins}
          vulnerabilitiesDataGridRef={mockRef}
        />
      </TooltipProvider>,
    );
  };

  // Helper to find the card content by severity name and check its count
  const expectSeverityCardToHaveCount = (severity: Severity, expectedCount: string) => {
    // Find the severity title text, then get the parent card content
    const titleElement = screen.getByText(severityDisplayNames[severity]);
    const cardContent = titleElement.parentElement;
    expect(cardContent).toHaveTextContent(expectedCount);
  };

  // Helper to find and click a severity card
  const getSeverityCard = (severity: Severity) => {
    const titleElement = screen.getByText(severityDisplayNames[severity]);
    // Navigate up to find the card element (parent of CardContent)
    return titleElement.closest('[role="button"]') || titleElement.parentElement?.parentElement;
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
      severityFilter: null,
      setSeverityFilter: vi.fn(),
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
      severityFilter: null,
      setSeverityFilter: vi.fn(),
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

  it('should handle plugins referencing categories not in categoryStats', () => {
    mockedUseReportStore.mockReturnValue({
      pluginPassRateThreshold: 0.5,
      setPluginPassRateThreshold: vi.fn(),
      showPercentagesOnRiskCards: false,
      setShowPercentagesOnRiskCards: vi.fn(),
      severityFilter: null,
      setSeverityFilter: vi.fn(),
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

  it('should scroll to vulnerabilities section when different severity cards are clicked in succession', () => {
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

    const criticalCard = getSeverityCard(Severity.Critical);
    const highCard = getSeverityCard(Severity.High);
    const mediumCard = getSeverityCard(Severity.Medium);

    fireEvent.click(criticalCard!);
    expect(mockElement.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });

    fireEvent.click(highCard!);
    expect(mockElement.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });

    fireEvent.click(mediumCard!);
    expect(mockElement.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });

    // Should be called 3 times (once per click)
    expect(mockElement.scrollIntoView).toHaveBeenCalledTimes(3);
  });

  it('should scroll to vulnerabilities section when severity card is clicked and showPercentagesOnRiskCards is true', () => {
    mockedUseReportStore.mockReturnValue({
      pluginPassRateThreshold: 0.8,
      setPluginPassRateThreshold: vi.fn(),
      showPercentagesOnRiskCards: true,
      setShowPercentagesOnRiskCards: vi.fn(),
      severityFilter: null,
      setSeverityFilter: vi.fn(),
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
    const criticalCard = getSeverityCard(Severity.Critical);
    fireEvent.click(criticalCard!);

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
    const highCard = getSeverityCard(Severity.High);

    // This should not throw an error even with null ref
    expect(() => fireEvent.click(highCard!)).not.toThrow();
  });

  it('should pass navigateToIssues callback to SeverityCard and trigger scroll on click', () => {
    const categoryStats = {
      plugin1: { pass: 0, total: 1 },
    };

    const plugins: RedteamPluginObject[] = [{ id: 'plugin1', severity: Severity.Critical }];

    const mockElement = document.createElement('div');
    mockElement.scrollIntoView = vi.fn();
    mockRef.current = mockElement;

    renderOverview(categoryStats, plugins);

    const criticalCard = getSeverityCard(Severity.Critical);

    fireEvent.click(criticalCard!);

    expect(mockElement.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
  });

  it('should display zero issues for all severities when pluginPassRateThreshold is 0', () => {
    mockedUseReportStore.mockReturnValue({
      pluginPassRateThreshold: 0,
      setPluginPassRateThreshold: vi.fn(),
      showPercentagesOnRiskCards: false,
      setShowPercentagesOnRiskCards: vi.fn(),
      severityFilter: null,
      setSeverityFilter: vi.fn(),
    });

    const categoryStats = {
      'critical-fail': { pass: 1, total: 10 },
      'high-fail': { pass: 5, total: 10 },
      'medium-fail': { pass: 7, total: 10 },
    };

    const plugins: RedteamPluginObject[] = [
      { id: 'critical-fail', severity: Severity.Critical },
      { id: 'high-fail', severity: Severity.High },
      { id: 'medium-fail', severity: Severity.Medium },
    ];

    renderOverview(categoryStats, plugins);

    Object.values(Severity).forEach((severity) => {
      expectSeverityCardToHaveCount(severity, '0');
    });
  });

  it('should set severity filter when a severity card is clicked', () => {
    const mockSetSeverityFilter = vi.fn();
    mockedUseReportStore.mockReturnValue({
      pluginPassRateThreshold: 1.0,
      setPluginPassRateThreshold: vi.fn(),
      showPercentagesOnRiskCards: false,
      setShowPercentagesOnRiskCards: vi.fn(),
      severityFilter: null,
      setSeverityFilter: mockSetSeverityFilter,
    });

    const categoryStats = {
      plugin1: { pass: 0, total: 1 },
    };

    const plugins: RedteamPluginObject[] = [{ id: 'plugin1', severity: Severity.Critical }];

    const mockElement = document.createElement('div');
    mockElement.scrollIntoView = vi.fn();
    mockRef.current = mockElement;

    renderOverview(categoryStats, plugins);

    const criticalCard = getSeverityCard(Severity.Critical);

    fireEvent.click(criticalCard!);

    // Should set the filter to Critical
    expect(mockSetSeverityFilter).toHaveBeenCalledWith(Severity.Critical);
    expect(mockElement.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
  });

  it('should clear severity filter when clicking the same severity card twice', () => {
    const mockSetSeverityFilter = vi.fn();
    mockedUseReportStore.mockReturnValue({
      pluginPassRateThreshold: 1.0,
      setPluginPassRateThreshold: vi.fn(),
      showPercentagesOnRiskCards: false,
      setShowPercentagesOnRiskCards: vi.fn(),
      severityFilter: Severity.Critical,
      setSeverityFilter: mockSetSeverityFilter,
    });

    const categoryStats = {
      plugin1: { pass: 0, total: 1 },
    };

    const plugins: RedteamPluginObject[] = [{ id: 'plugin1', severity: Severity.Critical }];

    const mockElement = document.createElement('div');
    mockElement.scrollIntoView = vi.fn();
    mockRef.current = mockElement;

    renderOverview(categoryStats, plugins);

    const criticalCard = getSeverityCard(Severity.Critical);

    fireEvent.click(criticalCard!);

    // Should clear the filter (set to null) since it was already Critical
    expect(mockSetSeverityFilter).toHaveBeenCalledWith(null);
  });
});
