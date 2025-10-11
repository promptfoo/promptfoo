import { renderWithProviders } from '@app/test-utils';
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

vi.mock('@promptfoo/redteam/constants', async (importOriginal) => {
  const original = await importOriginal<typeof import('@promptfoo/redteam/constants')>();
  return {
    ...original,
    FRAMEWORK_COMPLIANCE_IDS: ['framework-1', 'framework-2', 'framework-3'],
    ALIASED_PLUGIN_MAPPINGS: {
      'framework-1': {
        'cat-1': { plugins: ['plugin-A', 'plugin-B'], strategies: [] },
      },
      'framework-2': {
        'cat-2': { plugins: ['plugin-A', 'plugin-C'], strategies: [] },
      },
      'framework-3': {
        'cat-3': { plugins: ['plugin-D'], strategies: [] },
      },
    },
    riskCategorySeverityMap: {
      'plugin-A': 'low',
      'plugin-B': 'medium',
      'plugin-C': 'high',
      'plugin-D': 'low',
    },
    Severity: {
      Low: 'low',
      Medium: 'medium',
      High: 'high',
      Critical: 'critical',
    },
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
      'plugin-A': { pass: 10, total: 10, passWithFilter: 10 },
      'plugin-B': { pass: 9, total: 10, passWithFilter: 9 },
      'plugin-C': { pass: 8, total: 10, passWithFilter: 8 },
      'plugin-D': { pass: 5, total: 10, passWithFilter: 5 },
    };

    renderFrameworkCompliance(categoryStats);

    expect(screen.getByText(/Framework Compliance \(1\/3\)/)).toBeInTheDocument();

    expect(screen.getByText(/20.0% Attack Success Rate/)).toBeInTheDocument();
    expect(screen.getByText(/\(8\/40 tests failed across 4 plugins\)/)).toBeInTheDocument();

    expect(mockFrameworkCard).toHaveBeenCalledTimes(3);

    expect(mockFrameworkCard).toHaveBeenCalledWith(
      expect.objectContaining({
        framework: 'framework-1',
        isCompliant: true,
      }),
      expect.anything(),
    );

    expect(mockFrameworkCard).toHaveBeenCalledWith(
      expect.objectContaining({
        framework: 'framework-2',
        isCompliant: false,
      }),
      expect.anything(),
    );

    expect(mockFrameworkCard).toHaveBeenCalledWith(
      expect.objectContaining({
        framework: 'framework-3',
        isCompliant: false,
      }),
      expect.anything(),
    );
  });

  it('should show 0% attack success rate and 0 failed tests when all plugins are compliant', () => {
    const categoryStats = {
      'plugin-A': { pass: 10, total: 10, passWithFilter: 10 },
      'plugin-B': { pass: 10, total: 10, passWithFilter: 10 },
      'plugin-C': { pass: 10, total: 10, passWithFilter: 10 },
    };

    renderFrameworkCompliance(categoryStats);

    expect(screen.getByText(/0.0% Attack Success Rate/)).toBeInTheDocument();
    expect(screen.getByText(/\(0\/30 tests failed across 3 plugins\)/)).toBeInTheDocument();
  });

  it('should display the highest severity among non-compliant plugins for each framework', () => {
    vi.mocked(mockFrameworkCard).mockImplementation(({ framework }) => (
      <div data-testid={`framework-card-${framework}`} />
    ));

    const categoryStats = {
      'plugin-A': { pass: 10, total: 10, passWithFilter: 10 },
      'plugin-B': { pass: 8, total: 10, passWithFilter: 8 },
      'plugin-C': { pass: 5, total: 10, passWithFilter: 5 },
    };

    renderFrameworkCompliance(categoryStats);

    expect(mockFrameworkCard).toHaveBeenCalledWith(
      expect.objectContaining({
        framework: 'framework-2',
        isCompliant: false,
        frameworkSeverity: 'high',
      }),
      expect.anything(),
    );
  });

  it('should render the CSVExporter component with the correct categoryStats and pluginPassRateThreshold props', () => {
    const pluginPassRateThreshold = 0.75;
    const categoryStats = {
      'plugin-1': { pass: 5, total: 10, passWithFilter: 5 },
      'plugin-2': { pass: 8, total: 10, passWithFilter: 8 },
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
        'plugin-A': { pass: 0, total: 0, passWithFilter: 0 },
        'plugin-B': { pass: 0, total: 0, passWithFilter: 0 },
      },
      strategyStats: {},
      expectedText: /0.0% Attack Success Rate/,
      expectedFailedText: /\(0\/0 tests failed across 0 plugins\)/,
    },
    {
      name: 'no tests at all (totalTests = 0)',
      categoryStats: {
        'plugin-A': { pass: 0, total: 0, passWithFilter: 0 },
        'plugin-B': { pass: 0, total: 0, passWithFilter: 0 },
        'plugin-C': { pass: 0, total: 0, passWithFilter: 0 },
        'plugin-D': { pass: 0, total: 0, passWithFilter: 0 },
      },
      strategyStats: { 'strategy-1': { pass: 0, total: 0 } },
      expectedText: /0.0% Attack Success Rate/,
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
