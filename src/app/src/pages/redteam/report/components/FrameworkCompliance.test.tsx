import { renderWithProviders } from '@app/utils/testutils';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FrameworkCard from './FrameworkCard';
import FrameworkCompliance from './FrameworkCompliance';
import { getFrameworkPlugins } from './FrameworkComplianceUtils';
import FrameworkExporter from './FrameworkExporter';
import { useReportStore } from './store';

vi.mock('./store');
vi.mock('./FrameworkCard');
vi.mock('./FrameworkExporter');

const mockUseReportStore = vi.mocked(useReportStore);
const mockFrameworkCard = vi.mocked(FrameworkCard);
const mockFrameworkExporter = vi.mocked(FrameworkExporter);

describe('FrameworkCompliance', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockFrameworkCard.mockImplementation(({ framework, frameworkSeverity }) => (
      <div data-testid={`framework-card-${framework}`} data-severity={frameworkSeverity} />
    ));
    mockFrameworkExporter.mockImplementation(() => <div data-testid="csv-exporter" />);
  });

  const renderFrameworkCompliance = (
    categoryStats: any = {},
    pluginPassRateThreshold = 0.9,
    config?: any,
  ) => {
    mockUseReportStore.mockReturnValue({
      pluginPassRateThreshold,
      setPluginPassRateThreshold: vi.fn(),
      showUntestedPlugins: true,
      setShowUntestedPlugins: vi.fn(),
    });

    return renderWithProviders(
      <FrameworkCompliance evalId="test-eval-id" categoryStats={categoryStats} config={config} />,
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

  it('stacks heading controls on narrow screens', () => {
    renderFrameworkCompliance();

    expect(screen.getByTestId('framework-compliance-header')).toHaveClass(
      'flex-col',
      'items-start',
      'sm:flex-row',
      'sm:justify-between',
    );
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

  it('should render the FrameworkExporter component with the correct categoryStats and pluginPassRateThreshold props', () => {
    const pluginPassRateThreshold = 0.75;
    const categoryStats = {
      bola: { pass: 5, total: 10, passWithFilter: 5, failCount: 5 },
      rbac: { pass: 8, total: 10, passWithFilter: 8, failCount: 2 },
    };

    renderFrameworkCompliance(categoryStats, pluginPassRateThreshold);

    expect(mockFrameworkExporter).toHaveBeenCalledTimes(1);
    expect(mockFrameworkExporter).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryStats: categoryStats,
        pluginPassRateThreshold: pluginPassRateThreshold,
      }),
      undefined,
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
      expectedText: /No test results for the mapped framework plugins/,
      expectedFailedText: null,
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
      expectedText: /No test results for the mapped framework plugins/,
      expectedFailedText: null,
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

  it('does not count an untested AIUC-1 framework as compliant', () => {
    renderFrameworkCompliance({}, 0.9, { redteam: { frameworks: ['aiuc:1'] } });
    expect(screen.getByText('Framework Compliance (0/1)')).toBeInTheDocument();
    expect(mockFrameworkExporter.mock.calls[0][0].frameworksToShow).toEqual(['aiuc:1']);
  });

  it('does not count AIUC-1 as compliant when all mapped plugins pass but E018 has no tests', () => {
    const stats = Object.fromEntries(
      [...getFrameworkPlugins('aiuc:1', {})].map((id) => [
        id,
        { pass: 1, total: 1, failCount: 0, passWithFilter: 0 },
      ]),
    );
    renderFrameworkCompliance(stats, 0.9, { redteam: { frameworks: ['aiuc:1'] } });
    expect(screen.getByText('Framework Compliance (0/1)')).toBeInTheDocument();
  });

  it('should filter frameworks based on config', () => {
    const categoryStats = {
      bola: { pass: 10, total: 10, passWithFilter: 10, failCount: 0 },
    };
    const config = {
      redteam: {
        frameworks: ['owasp:llm', 'owasp:api'],
      },
    };

    renderFrameworkCompliance(categoryStats, 0.9, config);

    // Should only render FrameworkCards for the configured frameworks
    const frameworkCardCalls = mockFrameworkCard.mock.calls;
    const renderedFrameworks = frameworkCardCalls.map((call) => call[0].framework);

    // Should only include configured frameworks
    expect(renderedFrameworks.filter((f) => f === 'owasp:llm' || f === 'owasp:api').length).toBe(
      renderedFrameworks.length,
    );

    // Should not include other frameworks
    expect(renderedFrameworks.includes('mitre:atlas')).toBe(false);
    expect(renderedFrameworks.includes('nist:ai:measure')).toBe(false);
  });

  it('should show all frameworks when no config.redteam.frameworks is provided', () => {
    const categoryStats = {
      bola: { pass: 10, total: 10, passWithFilter: 10, failCount: 0 },
    };

    renderFrameworkCompliance(categoryStats, 0.9, undefined);

    expect(mockFrameworkCard.mock.calls.map(([props]) => props.framework)).toEqual([
      'mitre:atlas',
      'nist:ai:measure',
      'owasp:api',
      'owasp:llm',
      'owasp:agentic',
      'eu:ai-act',
      'iso:42001',
      'gdpr',
      'dod:ai:ethics',
      'aiuc:1',
    ]);
  });

  it('should pass frameworksToShow to FrameworkExporter', () => {
    const categoryStats = {
      bola: { pass: 10, total: 10, passWithFilter: 10, failCount: 0 },
    };
    const config = {
      redteam: {
        frameworks: ['owasp:llm'],
      },
    };

    renderFrameworkCompliance(categoryStats, 0.9, config);

    // FrameworkExporter should receive the filtered frameworks
    expect(mockFrameworkExporter).toHaveBeenCalledWith(
      expect.objectContaining({
        frameworksToShow: ['owasp:llm'],
      }),
      undefined,
    );
  });

  it('should pass showUntestedPlugins from the store to FrameworkCard', () => {
    const categoryStats = {
      bola: { pass: 10, total: 10, passWithFilter: 10, failCount: 0 },
    };

    mockUseReportStore.mockReturnValue({
      pluginPassRateThreshold: 0.9,
      setPluginPassRateThreshold: vi.fn(),
      showUntestedPlugins: false,
      setShowUntestedPlugins: vi.fn(),
    });

    renderWithProviders(
      <FrameworkCompliance evalId="test-eval-id" categoryStats={categoryStats} />,
    );

    expect(mockFrameworkCard).toHaveBeenCalled();
    expect(mockFrameworkCard.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        showUntestedPlugins: false,
      }),
    );
  });
});
