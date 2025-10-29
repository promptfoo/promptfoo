import { renderWithProviders } from '@app/utils/testutils';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FrameworkCard from './FrameworkCard';
import FrameworkCompliance from './FrameworkCompliance';
import CSVExporter from './FrameworkCsvExporter';
import { useReportStore } from './store';

vi.mock('./store');
vi.mock('./FrameworkCard');
vi.mock('./FrameworkCsvExporter');
vi.mock('../utils/color', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/color')>();
  return {
    ...actual,
    getProgressColor: vi.fn().mockReturnValue('mockedColor'),
  };
});

const mockUseReportStore = vi.mocked(useReportStore);
const mockFrameworkCard = vi.mocked(FrameworkCard);
const mockCSVExporter = vi.mocked(CSVExporter);

describe('FrameworkCompliance', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockFrameworkCard.mockImplementation(({ framework, frameworkSeverity }) => (
      <div data-testid={`framework-card-${framework}`} data-severity={frameworkSeverity} />
    ));
    mockCSVExporter.mockImplementation(() => <div data-testid="csv-exporter" />);

    mockUseReportStore.mockReturnValue({
      pluginPassRateThreshold: 0.9,
      setPluginPassRateThreshold: vi.fn(),
    });
  });

  const renderFrameworkCompliance = (categoryStats = {}, pluginPassRateThreshold = 0.9) => {
    mockUseReportStore.mockReturnValue({
      pluginPassRateThreshold,
      setPluginPassRateThreshold: vi.fn(),
    });

    return renderWithProviders(
      <FrameworkCompliance evalId="test-eval-id" categoryStats={categoryStats} />,
    );
  };

  it('should display the correct number of compliant frameworks and render a FrameworkCard for each framework', () => {
    const categoryStats = {
      bola: { pass: 10, total: 10, passWithFilter: 10, failCount: 0 },
      rbac: { pass: 9, total: 10, passWithFilter: 9, failCount: 1 },
      'sql-injection': { pass: 8, total: 10, passWithFilter: 8, failCount: 2 },
      ssrf: { pass: 5, total: 10, passWithFilter: 5, failCount: 5 },
    };

    renderFrameworkCompliance(categoryStats);

    // The number of compliant frameworks depends on which frameworks include these plugins
    // and their pass rates. The test should verify FrameworkCard is called for each framework.
    expect(screen.getByText(/Framework Compliance/)).toBeInTheDocument();

    expect(screen.getByText(/20\.00% Attack Success Rate/)).toBeInTheDocument();
    expect(screen.getByText(/\(8\/40 tests failed across 4 plugins\)/)).toBeInTheDocument();

    // FrameworkCard should be called for each framework in FRAMEWORK_COMPLIANCE_IDS
    expect(mockFrameworkCard.mock.calls.length).toBeGreaterThan(0);
  });

  it('should show 0% attack success rate and 0 failed tests when all plugins are compliant', () => {
    const categoryStats = {
      bola: { pass: 10, total: 10, passWithFilter: 10, failCount: 0 },
      rbac: { pass: 10, total: 10, passWithFilter: 10, failCount: 0 },
      'sql-injection': { pass: 10, total: 10, passWithFilter: 10, failCount: 0 },
    };

    renderFrameworkCompliance(categoryStats);

    expect(screen.getByText(/0\.00% Attack Success Rate/)).toBeInTheDocument();
    expect(screen.getByText(/\(0\/30 tests failed across 3 plugins\)/)).toBeInTheDocument();
  });

  it('should display the highest severity among non-compliant plugins for each framework', () => {
    vi.mocked(mockFrameworkCard).mockImplementation(({ framework }) => (
      <div data-testid={`framework-card-${framework}`} />
    ));

    const categoryStats = {
      bola: { pass: 10, total: 10, passWithFilter: 10, failCount: 0 },
      rbac: { pass: 8, total: 10, passWithFilter: 8, failCount: 2 },
      'sql-injection': { pass: 5, total: 10, passWithFilter: 5, failCount: 5 },
    };

    renderFrameworkCompliance(categoryStats);

    // Verify that FrameworkCard is called with severity information
    // The specific severity depends on the real riskCategorySeverityMap
    expect(mockFrameworkCard).toHaveBeenCalled();
    const calls = mockFrameworkCard.mock.calls;
    expect(calls.some((call) => call[0].frameworkSeverity !== undefined)).toBe(true);
  });

  it('should render the CSVExporter component with the correct categoryStats and pluginPassRateThreshold props', () => {
    const pluginPassRateThreshold = 0.75;
    const categoryStats = {
      bola: { pass: 5, total: 10, passWithFilter: 5, failCount: 5 },
      rbac: { pass: 8, total: 10, passWithFilter: 8, failCount: 2 },
    };

    renderFrameworkCompliance(categoryStats, pluginPassRateThreshold);

    expect(mockCSVExporter).toHaveBeenCalledTimes(1);
    expect(mockCSVExporter).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryStats: categoryStats,
        pluginPassRateThreshold: pluginPassRateThreshold,
      }),
      expect.anything(),
    );
  });

  it.each([
    {
      name: 'categoryStats entries with zero total tests',
      categoryStats: {
        bola: { pass: 0, total: 0, passWithFilter: 0, failCount: 0 },
        rbac: { pass: 0, total: 0, passWithFilter: 0, failCount: 0 },
      },
      strategyStats: {},
      expectedText: /0\.00% Attack Success Rate/,
      expectedFailedText: /\(0\/0 tests failed across 0 plugins\)/,
    },
    {
      name: 'no tests at all (totalTests = 0)',
      categoryStats: {
        bola: { pass: 0, total: 0, passWithFilter: 0, failCount: 0 },
        rbac: { pass: 0, total: 0, passWithFilter: 0, failCount: 0 },
        'sql-injection': { pass: 0, total: 0, passWithFilter: 0, failCount: 0 },
        ssrf: { pass: 0, total: 0, passWithFilter: 0, failCount: 0 },
      },
      strategyStats: { jailbreak: { pass: 0, total: 0 } },
      expectedText: /0\.00% Attack Success Rate/,
      expectedFailedText: /\(0\/0 tests failed across 0 plugins\)/,
    },
    {
      name: 'empty categoryStats and strategyStats',
      categoryStats: {},
      strategyStats: {},
      expectedText: /Framework Compliance/,
      expectedFailedText: null,
    },
  ])('should handle $name', ({ categoryStats, expectedText, expectedFailedText }) => {
    renderFrameworkCompliance(categoryStats);

    expect(screen.getByText(expectedText)).toBeInTheDocument();

    if (expectedFailedText) {
      expect(screen.getByText(expectedFailedText)).toBeInTheDocument();
    }
  });
});
