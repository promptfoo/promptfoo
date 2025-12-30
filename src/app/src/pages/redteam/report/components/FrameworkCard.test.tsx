import React from 'react';

import { renderWithProviders } from '@app/utils/testutils';
import { Severity, severityDisplayNames } from '@promptfoo/redteam/constants';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FrameworkCard from './FrameworkCard';
import { type CategoryStats } from './FrameworkComplianceUtils';

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(),
}));

vi.mock('./FrameworkComplianceUtils', async () => {
  const actual = await vi.importActual('./FrameworkComplianceUtils');
  return {
    ...actual,
    getPluginDisplayName: vi.fn((plugin) => plugin),
  };
});

describe('FrameworkCard', () => {
  type FrameworkCardProps = React.ComponentProps<typeof FrameworkCard>;

  const defaultProps: FrameworkCardProps = {
    evalId: 'test-eval-id',
    framework: 'nist:ai:measure',
    isCompliant: true,
    frameworkSeverity: Severity.Low,
    categoryStats: {
      'excessive-agency': { pass: 10, total: 10, failCount: 0 },
      'pii:direct': { pass: 9, total: 10, failCount: 1 },
    },
    pluginPassRateThreshold: 0.8,
    nonCompliantPlugins: [],
    idx: 0,
  };

  const renderFrameworkCard = (props: Partial<FrameworkCardProps> = {}) => {
    return renderWithProviders(<FrameworkCard {...defaultProps} {...props} />);
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display the compliant state, including the compliant icon and green summary chip, when the isCompliant prop is true and nonCompliantPlugins is empty', () => {
    renderFrameworkCard({
      isCompliant: true,
      nonCompliantPlugins: [],
      categoryStats: {
        'excessive-agency': { pass: 10, total: 10, failCount: 0 },
        'pii:direct': { pass: 9, total: 10, failCount: 1 },
      },
    });

    const cardElement = screen.getByText('NIST AI RMF').closest('.framework-item');
    expect(cardElement).toHaveClass('compliant');

    // Check for Lucide CheckCircle icon
    const compliantIcon = document.querySelector('.icon-compliant');
    expect(compliantIcon).toBeInTheDocument();

    expect(screen.queryByText(severityDisplayNames[Severity.Low])).not.toBeInTheDocument();
    expect(screen.queryByText(severityDisplayNames[Severity.High])).not.toBeInTheDocument();

    const summaryChip = screen.getByText('0 / 2 failed');
    expect(summaryChip).toBeInTheDocument();
  });

  it('should display the non-compliant state, including the severity chip and a list of failed plugins, when isCompliant is false and nonCompliantPlugins contains plugin names', () => {
    const nonCompliantPlugins = ['pii:direct', 'pii:session'];
    renderFrameworkCard({
      isCompliant: false,
      frameworkSeverity: Severity.High,
      nonCompliantPlugins: nonCompliantPlugins,
      categoryStats: {
        'excessive-agency': { pass: 10, total: 10, failCount: 0 },
        'pii:direct': { pass: 5, total: 10, failCount: 5 },
        'pii:session': { pass: 0, total: 10, failCount: 10 },
      },
    });

    const cardElement = screen.getByText('NIST AI RMF').closest('.framework-item');
    expect(cardElement).toHaveClass('non-compliant');

    expect(screen.getByText(severityDisplayNames[Severity.High])).toBeInTheDocument();

    const summaryChip = screen.getByText('2 / 3 failed');
    expect(summaryChip).toBeInTheDocument();

    nonCompliantPlugins.forEach((plugin) => {
      expect(screen.getByText(plugin)).toBeInTheDocument();
    });

    // No compliant icon when non-compliant
    const compliantIcon = document.querySelector('.icon-compliant');
    expect(compliantIcon).not.toBeInTheDocument();
  });

  it('should render categorized plugin lists with correct category names, chips, and plugin status for an OWASP framework with plugins in multiple categories', () => {
    // Using real OWASP API framework with plugins that are actually in it
    // owasp:api:01 has: ['bola', 'rbac']
    // owasp:api:02 has: ['bfla', 'rbac']
    const categoryStats: Record<string, { pass: number; total: number; failCount: number }> = {
      bola: { pass: 10, total: 10, failCount: 0 },
      bfla: { pass: 0, total: 10, failCount: 10 },
      rbac: { pass: 5, total: 10, failCount: 5 },
    };

    renderFrameworkCard({
      framework: 'owasp:api',
      isCompliant: false,
      frameworkSeverity: Severity.High,
      categoryStats: categoryStats,
      pluginPassRateThreshold: 0.8,
      nonCompliantPlugins: ['bfla', 'rbac'],
    });

    // OWASP API framework name should be displayed
    expect(screen.getByText('OWASP API Top 10')).toBeInTheDocument();

    // Verify OWASP API category names are displayed (from OWASP_API_TOP_10_NAMES)
    // These plugins appear in categories 1, 2, and 5
    expect(screen.getByText(/Broken Object Level Authorization/)).toBeInTheDocument();

    // Verify plugins are displayed (some appear in multiple categories, so use getAllByText)
    expect(screen.getAllByText('bola').length).toBeGreaterThan(0);
    expect(screen.getAllByText('bfla').length).toBeGreaterThan(0);
    expect(screen.getAllByText('rbac').length).toBeGreaterThan(0);
  });

  it('should display the correct pass rate percentage and tooltip for a plugin with test data', () => {
    const pluginName = 'excessive-agency';
    const pass = 7;
    const total = 10;
    const failureRate = ((total - pass) / total) * 100;
    const failureRateFormatted = failureRate.toFixed(2);
    const tooltipText = `${total - pass}/${total} attacks successful`;

    renderFrameworkCard({
      categoryStats: {
        [pluginName]: { pass, total, failCount: total - pass },
      },
      nonCompliantPlugins: [pluginName],
    });

    screen.getByText(pluginName);

    const percentageElement = screen.getByText(`${failureRateFormatted}%`);

    expect(percentageElement).toBeInTheDocument();

    expect(percentageElement).toHaveAttribute('aria-label', tooltipText);
  });

  it('should display Critical severity tooltip when framework is non-compliant with Critical severity', () => {
    renderFrameworkCard({
      isCompliant: false,
      frameworkSeverity: Severity.Critical,
    });

    // The severity badge wrapper has an aria-label with the tooltip content
    const severityWrapper = screen.getByLabelText(
      'Critical: Requires immediate attention - high risk security vulnerabilities',
    );
    expect(severityWrapper).toBeInTheDocument();
    expect(screen.getByText(severityDisplayNames[Severity.Critical])).toBeInTheDocument();
  });

  it('should render compliant card with success styling', () => {
    renderFrameworkCard({ isCompliant: true });
    const cardElement = screen.getByText('NIST AI RMF').closest('.framework-item');
    expect(cardElement).toHaveClass('compliant');
  });

  it('should render non-compliant card with error styling', () => {
    renderFrameworkCard({ isCompliant: false });
    const cardElement = screen.getByText('NIST AI RMF').closest('.framework-item');
    expect(cardElement).toHaveClass('non-compliant');
  });

  it('should render the summary chip for non-compliant framework', () => {
    const frameworkSeverity = Severity.High;
    renderFrameworkCard({
      isCompliant: false,
      frameworkSeverity: frameworkSeverity,
      nonCompliantPlugins: ['excessive-agency'],
      categoryStats: {
        'excessive-agency': { pass: 0, total: 1, failCount: 1 },
      },
    });

    const summaryChip = screen.getByText('1 / 1 failed');
    expect(summaryChip).toBeInTheDocument();

    const severityChip = screen.getByText(severityDisplayNames[frameworkSeverity]);
    expect(severityChip).toBeInTheDocument();
  });

  it('should render Failed and Passed sections with labels', () => {
    renderFrameworkCard({
      isCompliant: false,
      nonCompliantPlugins: ['pii:session'],
      categoryStats: {
        'excessive-agency': { pass: 10, total: 10, failCount: 0 },
        'pii:direct': { pass: 9, total: 10, failCount: 0 },
        'pii:session': { pass: 5, total: 10, failCount: 5 },
      },
    });

    const failedSection = screen.getByText('Failed:');
    expect(failedSection).toBeInTheDocument();

    const passedSection = screen.getByText('Passed:');
    expect(passedSection).toBeInTheDocument();
  });

  it('should render check icon when isCompliant is true', () => {
    renderFrameworkCard({ isCompliant: true });
    const checkCircleIcon = document.querySelector('.icon-compliant');
    expect(checkCircleIcon).toBeInTheDocument();
  });

  it('should maintain proper layout and spacing when rendering multiple non-compliant plugins', () => {
    // Use real plugins that exist in the framework
    const nonCompliantPlugins = [
      'excessive-agency',
      'pii:direct',
      'pii:session',
      'pii:api-db',
      'pii:social',
      'harmful:privacy',
      'harmful:misinformation-disinformation',
    ];
    const categoryStats = nonCompliantPlugins.reduce((acc, plugin) => {
      acc[plugin] = { pass: 0, total: 10, failCount: 10 };
      return acc;
    }, {} as CategoryStats);

    renderFrameworkCard({
      isCompliant: false,
      frameworkSeverity: Severity.High,
      nonCompliantPlugins: nonCompliantPlugins,
      categoryStats: categoryStats,
    });

    const cardElement = screen.getByText('NIST AI RMF').closest('.framework-item');
    expect(cardElement).toHaveClass('non-compliant');

    // Verify the summary chip shows correct counts
    const summaryChip = screen.getByText(
      `${nonCompliantPlugins.length} / ${nonCompliantPlugins.length} failed`,
    );
    expect(summaryChip).toBeInTheDocument();

    // Verify at least some plugins are displayed
    expect(screen.getByText('excessive-agency')).toBeInTheDocument();
    expect(screen.getByText('pii:direct')).toBeInTheDocument();
  });
});
