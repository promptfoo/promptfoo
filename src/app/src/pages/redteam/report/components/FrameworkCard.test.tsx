import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { Severity, severityDisplayNames } from '@promptfoo/redteam/constants';
import FrameworkCard from './FrameworkCard';
import userEvent from '@testing-library/user-event';

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(),
}));

vi.mock('@promptfoo/redteam/constants', async () => {
  const original = await vi.importActual<typeof import('@promptfoo/redteam/constants')>(
    '@promptfoo/redteam/constants',
  );
  return {
    ...original,
    FRAMEWORK_NAMES: {
      'test-framework': 'Test Framework',
      'owasp:api': 'OWASP API Security Top 10',
    },
    FRAMEWORK_DESCRIPTIONS: {
      'test-framework': 'A framework for testing.',
      'owasp:api': 'OWASP API Security Top 10 Description',
    },
    OWASP_API_TOP_10_NAMES: [
      'API1:2023 Broken Object Level Authorization',
      'API2:2023 Broken Authentication',
      'API3:2023 Broken Object Property Level Authorization',
      'API4:2023 Unrestricted Resource Consumption',
      'API5:2023 Broken Function Level Authorization',
      'API6:2023 Unrestricted Access to Sensitive Business Flows',
      'API7:2023 Server Side Request Forgery',
      'API8:2023 Security Misconfiguration',
      'API9:2023 Improper Inventory Management',
      'API10:2023 Unsafe Consumption of APIs',
    ],
    ALIASED_PLUGIN_MAPPINGS: {
      ...original.ALIASED_PLUGIN_MAPPINGS,
      'test-framework': {},
      'owasp:api': {
        'owasp:api:1': { plugins: ['plugin-1', 'plugin-2'] },
        'owasp:api:2': { plugins: ['plugin-3', 'plugin-4'] },
      },
    },
  };
});

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
    framework: 'test-framework',
    isCompliant: true,
    frameworkSeverity: Severity.Low,
    categoryStats: {
      'plugin-1': { pass: 10, total: 10, failCount: 0 },
      'plugin-2': { pass: 9, total: 10, failCount: 1 },
    },
    pluginPassRateThreshold: 0.8,
    nonCompliantPlugins: [],
    idx: 0,
  };

  const renderFrameworkCard = (props: Partial<FrameworkCardProps> = {}) => {
    const theme = createTheme();
    return render(
      <ThemeProvider theme={theme}>
        <FrameworkCard {...defaultProps} {...props} />
      </ThemeProvider>,
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display the compliant state, including the compliant icon and green summary chip, when the isCompliant prop is true and nonCompliantPlugins is empty', () => {
    renderFrameworkCard({
      isCompliant: true,
      nonCompliantPlugins: [],
      categoryStats: {
        'plugin-1': { pass: 10, total: 10, failCount: 0 },
        'plugin-2': { pass: 9, total: 10, failCount: 1 },
      },
    });

    const cardElement = screen.getByText('Test Framework').closest('.framework-item');
    expect(cardElement).toHaveClass('compliant');

    const compliantIcons = screen.getAllByTestId('CheckCircleIcon');
    const mainCompliantIcon = compliantIcons.find((icon) =>
      icon.classList.contains('icon-compliant'),
    );
    expect(mainCompliantIcon).toBeInTheDocument();

    expect(screen.queryByText(severityDisplayNames[Severity.Low])).not.toBeInTheDocument();
    expect(screen.queryByText(severityDisplayNames[Severity.High])).not.toBeInTheDocument();

    const summaryChip = screen.getByText('0 / 2 failed');
    expect(summaryChip).toBeInTheDocument();

    const chipContainer = summaryChip.parentElement;
    expect(chipContainer).toHaveStyle('background-color: #4caf50');
  });

  it('should display the non-compliant state, including the severity chip and a list of failed plugins, when isCompliant is false and nonCompliantPlugins contains plugin names', () => {
    const nonCompliantPlugins = ['plugin-2', 'plugin-3'];
    renderFrameworkCard({
      isCompliant: false,
      frameworkSeverity: Severity.High,
      nonCompliantPlugins: nonCompliantPlugins,
      categoryStats: {
        'plugin-1': { pass: 10, total: 10, failCount: 0 },
        'plugin-2': { pass: 5, total: 10, failCount: 5 },
        'plugin-3': { pass: 0, total: 10, failCount: 10 },
      },
    });

    const cardElement = screen.getByText('Test Framework').closest('.framework-item');
    expect(cardElement).toHaveClass('non-compliant');

    expect(screen.getByText(severityDisplayNames[Severity.High])).toBeInTheDocument();

    const summaryChip = screen.getByText('2 / 3 failed');
    expect(summaryChip).toBeInTheDocument();

    nonCompliantPlugins.forEach((plugin) => {
      expect(screen.getByText(plugin)).toBeInTheDocument();
    });

    const mainCompliantIcon = screen.queryByTestId('CheckCircleIcon.icon-compliant');
    expect(mainCompliantIcon).not.toBeInTheDocument();
  });

  it('should render categorized plugin lists with correct category names, chips, and plugin status for an OWASP framework with plugins in multiple categories', () => {
    const categoryStats: Record<string, { pass: number; total: number; failCount: number }> = {
      'plugin-1': { pass: 10, total: 10, failCount: 0 },
      'plugin-2': { pass: 0, total: 10, failCount: 10 },
      'plugin-3': { pass: 5, total: 10, failCount: 5 },
      'plugin-4': { pass: 10, total: 10, failCount: 0 },
    };

    renderFrameworkCard({
      framework: 'owasp:api',
      isCompliant: false,
      frameworkSeverity: Severity.High,
      categoryStats: categoryStats,
      pluginPassRateThreshold: 0.8,
      nonCompliantPlugins: ['plugin-2', 'plugin-3'],
    });

    expect(screen.getByText('1. API1:2023 Broken Object Level Authorization')).toBeInTheDocument();
    expect(screen.getByText('2. API2:2023 Broken Authentication')).toBeInTheDocument();

    const failedPluginsChips = screen.getAllByText('1 / 2 plugins failed');
    expect(failedPluginsChips).toHaveLength(2);

    expect(screen.getByText('plugin-1')).toBeInTheDocument();
    expect(screen.getByText('plugin-2')).toBeInTheDocument();
    expect(screen.getByText('plugin-3')).toBeInTheDocument();
    expect(screen.getByText('plugin-4')).toBeInTheDocument();
  });

  it('should display the correct pass rate percentage and tooltip for a plugin with test data', () => {
    const pluginName = 'test-plugin';
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

  it('should display Critical severity tooltip when framework is non-compliant with Critical severity', async () => {
    renderFrameworkCard({
      isCompliant: false,
      frameworkSeverity: Severity.Critical,
    });

    const severityChip = screen.getByText(severityDisplayNames[Severity.Critical]);

    await userEvent.hover(severityChip);

    const tooltipText = await screen.findByText(
      'Critical: Requires immediate attention - high risk security vulnerabilities',
    );

    expect(tooltipText).toBeVisible();
  });
});
