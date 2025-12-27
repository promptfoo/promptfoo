import { TooltipProvider } from '@app/components/ui/tooltip';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RiskCard from './RiskCard';
import { useReportStore } from './store';

vi.mock('./store', () => ({
  useReportStore: vi.fn(),
}));

const RiskCategoryDrawerMock = {
  mockProps: null as any,
};

vi.mock('./RiskCategoryDrawer', () => ({
  default: vi.fn().mockImplementation((props) => {
    RiskCategoryDrawerMock.mockProps = props;
    return <div data-testid="mock-risk-category-drawer" />;
  }),
}));

// Helper to render with TooltipProvider
const renderWithProviders = (ui: React.ReactElement) => {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
};

describe('RiskCard', () => {
  const mockUseReportStore = vi.mocked(useReportStore);

  const defaultProps = {
    title: 'Default Title',
    subtitle: 'Default Subtitle',
    progressValue: 50,
    numTestsPassed: 10,
    numTestsFailed: 10,
    testTypes: [
      { name: 'sql-injection', categoryPassed: false, numPassed: 5, numFailed: 5 },
      { name: 'ssrf', categoryPassed: true, numPassed: 5, numFailed: 5 },
    ],
    evalId: 'test-eval-id',
    failuresByPlugin: {
      'sql-injection': [{ prompt: 'prompt1', output: 'output1' }],
      ssrf: [{ prompt: 'prompt2', output: 'output2' }],
    },
    passesByPlugin: {
      'sql-injection': [{ prompt: 'prompt3', output: 'output3' }],
      ssrf: [{ prompt: 'prompt4', output: 'output4' }],
    },
  };

  const createTestProps = (overrides = {}) => ({
    ...defaultProps,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseReportStore.mockReturnValue({
      showPercentagesOnRiskCards: false,
      pluginPassRateThreshold: 1.0,
      setShowPercentagesOnRiskCards: vi.fn(),
      setPluginPassRateThreshold: vi.fn(),
    });
    RiskCategoryDrawerMock.mockProps = null;
  });

  it('should display the provided title, subtitle, and a Gauge with the correct progressValue when given valid testTypes with at least one test', () => {
    const props = createTestProps({
      title: 'Security Risks',
      subtitle: 'Analysis of potential vulnerabilities',
      progressValue: 75.5,
    });
    renderWithProviders(<RiskCard {...props} />);

    expect(screen.getByText('Security Risks')).toBeInTheDocument();
    expect(screen.getByText('Analysis of potential vulnerabilities')).toBeInTheDocument();

    const expectedGaugeText = `${Math.round(props.progressValue)}%`;
    expect(screen.getByText(expectedGaugeText)).toBeInTheDocument();
  });

  it('should render nothing (return null) if all testTypes have numPassed and numFailed equal to 0', () => {
    const props = createTestProps({
      testTypes: [
        { name: 'sql-injection', categoryPassed: false, numPassed: 0, numFailed: 0 },
        { name: 'ssrf', categoryPassed: true, numPassed: 0, numFailed: 0 },
      ],
    });
    const { container } = render(<RiskCard {...props} />);
    expect(container.firstChild).toBeNull();
  });

  it('should display the correct number of failed probes and the correct passed/total count based on numTestsPassed and numTestsFailed props', () => {
    const numTestsPassed = 25;
    const numTestsFailed = 5;
    const props = createTestProps({
      numTestsPassed: numTestsPassed,
      numTestsFailed: numTestsFailed,
    });
    renderWithProviders(<RiskCard {...props} />);

    expect(screen.getByText(`${numTestsFailed} failed probes`)).toBeInTheDocument();
    expect(
      screen.getByText(`${numTestsPassed}/${numTestsPassed + numTestsFailed} passed`),
    ).toBeInTheDocument();
  });

  it('should render a list of test types with their display names and pass/fail indicators for each filtered testType', () => {
    const testTypes = [
      { name: 'sql-injection', categoryPassed: true, numPassed: 8, numFailed: 2 },
      { name: 'ssrf', categoryPassed: false, numPassed: 3, numFailed: 7 },
    ];

    renderWithProviders(<RiskCard {...createTestProps({ testTypes })} />);

    expect(screen.getByText('SQL Injection')).toBeInTheDocument();
    expect(screen.getByText('SSRF Vulnerability')).toBeInTheDocument();
  });

  it('should open the RiskCategoryDrawer with the correct category and test data when a test type list item is clicked', () => {
    renderWithProviders(<RiskCard {...defaultProps} />);

    const listItem = screen.getByText('SQL Injection');
    fireEvent.click(listItem);

    expect(RiskCategoryDrawerMock.mockProps).toBeDefined();
    expect(RiskCategoryDrawerMock.mockProps.category).toBe('sql-injection');
    expect(RiskCategoryDrawerMock.mockProps.evalId).toBe('test-eval-id');
    expect(RiskCategoryDrawerMock.mockProps.failures).toEqual(
      defaultProps.failuresByPlugin['sql-injection'],
    );
    expect(RiskCategoryDrawerMock.mockProps.passes).toEqual(
      defaultProps.passesByPlugin['sql-injection'],
    );
    expect(RiskCategoryDrawerMock.mockProps.numPassed).toBe(5);
    expect(RiskCategoryDrawerMock.mockProps.numFailed).toBe(5);
  });

  it('should display a percentage for each test type when showPercentagesOnRiskCards is true', () => {
    mockUseReportStore.mockReturnValue({
      showPercentagesOnRiskCards: true,
      pluginPassRateThreshold: 1.0,
      setShowPercentagesOnRiskCards: vi.fn(),
      setPluginPassRateThreshold: vi.fn(),
    });

    const testTypes = [
      { name: 'sql-injection', categoryPassed: false, numPassed: 2, numFailed: 8 },
      { name: 'ssrf', categoryPassed: true, numPassed: 7, numFailed: 3 },
    ];

    renderWithProviders(<RiskCard {...createTestProps({ testTypes })} />);

    const expectedSqlInjectionPercentage = `${Math.round((2 / (2 + 8)) * 100)}%`;
    const expectedSsrfPercentage = `${Math.round((7 / (7 + 3)) * 100)}%`;

    expect(screen.getByText(expectedSqlInjectionPercentage)).toBeInTheDocument();
    expect(screen.getByText(expectedSsrfPercentage)).toBeInTheDocument();
  });

  it('should apply correct color class when percentage is >= 0.8 and showPercentagesOnRiskCards is true', () => {
    mockUseReportStore.mockReturnValue({
      showPercentagesOnRiskCards: true,
      pluginPassRateThreshold: 1.0,
      setShowPercentagesOnRiskCards: vi.fn(),
      setPluginPassRateThreshold: vi.fn(),
    });

    const props = createTestProps({
      testTypes: [{ name: 'sql-injection', categoryPassed: true, numPassed: 8, numFailed: 2 }],
    });

    renderWithProviders(<RiskCard {...props} />);

    const percentageElement = screen.getByText('80%');
    // Check for emerald color class (success color)
    expect(percentageElement.className).toMatch(/text-emerald/);
  });

  it('should display "-" when progressValue is NaN', () => {
    const props = createTestProps({
      progressValue: NaN,
    });
    renderWithProviders(<RiskCard {...props} />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it("should handle strategyStats containing strategies that don't match any testType names", () => {
    const props = createTestProps({
      strategyStats: {
        'unknown-strategy': { pass: 2, total: 10 },
      },
    });

    renderWithProviders(<RiskCard {...props} />);

    expect(screen.getByText('Default Title')).toBeInTheDocument();
  });

  it('should handle test types with extremely long names without breaking the UI layout', () => {
    // Using a real plugin with a longer display name
    const longTestTypeName = 'harmful:misinformation-disinformation';
    const props = createTestProps({
      testTypes: [{ name: longTestTypeName, categoryPassed: true, numPassed: 1, numFailed: 0 }],
      failuresByPlugin: {},
      passesByPlugin: { [longTestTypeName]: [] },
    });
    renderWithProviders(<RiskCard {...props} />);

    // The component should render the display name from displayNameOverrides: "Disinformation Campaigns"
    const listItem = screen.getByText('Disinformation Campaigns');
    expect(listItem).toBeInTheDocument();
  });

  it('should render correctly when failuresByPlugin and passesByPlugin are empty objects', () => {
    const props = createTestProps({
      failuresByPlugin: {},
      passesByPlugin: {},
    });

    renderWithProviders(<RiskCard {...props} />);

    expect(screen.getByText(props.title)).toBeInTheDocument();
    expect(screen.getByText(props.subtitle)).toBeInTheDocument();
  });

  it('should open the RiskCategoryDrawer when a test type with no failures is clicked', () => {
    const props = createTestProps({
      testTypes: [{ name: 'rbac', categoryPassed: true, numPassed: 10, numFailed: 0 }],
      failuresByPlugin: {},
      passesByPlugin: { rbac: [] },
    });
    renderWithProviders(<RiskCard {...props} />);

    // Find the button containing "RBAC Implementation" text
    const listItem = screen.getByRole('button', { name: /RBAC Implementation/i });
    fireEvent.click(listItem);

    expect(screen.getByTestId('mock-risk-category-drawer')).toBeInTheDocument();
  });

  it('should render CheckCircle icon when showPercentagesOnRiskCards is false and pass rate is above pluginPassRateThreshold', () => {
    mockUseReportStore.mockReturnValue({
      showPercentagesOnRiskCards: false,
      pluginPassRateThreshold: 0.6,
      setShowPercentagesOnRiskCards: vi.fn(),
      setPluginPassRateThreshold: vi.fn(),
    });

    const props = createTestProps({
      testTypes: [{ name: 'sql-injection', categoryPassed: true, numPassed: 7, numFailed: 3 }],
    });

    renderWithProviders(<RiskCard {...props} />);

    // Look for lucide CheckCircle icon by class (Lucide uses circle-check-big internally)
    const checkCircleIcon = document.querySelector('.lucide-circle-check-big');
    expect(checkCircleIcon).toBeInTheDocument();
  });

  it('should render XCircle icon when showPercentagesOnRiskCards is false and pass rate is below pluginPassRateThreshold', () => {
    mockUseReportStore.mockReturnValue({
      showPercentagesOnRiskCards: false,
      pluginPassRateThreshold: 0.8,
      setShowPercentagesOnRiskCards: vi.fn(),
      setPluginPassRateThreshold: vi.fn(),
    });

    const props = createTestProps({
      testTypes: [{ name: 'sql-injection', categoryPassed: false, numPassed: 4, numFailed: 6 }],
    });

    renderWithProviders(<RiskCard {...props} />);

    // Look for lucide XCircle icon by class (Lucide uses circle-x internally)
    const xCircleIcon = document.querySelector('.lucide-circle-x');
    expect(xCircleIcon).toBeInTheDocument();
  });

  it('should display CheckCircle icon when test pass rate equals pluginPassRateThreshold', () => {
    const threshold = 0.75;
    mockUseReportStore.mockReturnValue({
      showPercentagesOnRiskCards: false,
      pluginPassRateThreshold: threshold,
      setShowPercentagesOnRiskCards: vi.fn(),
      setPluginPassRateThreshold: vi.fn(),
    });

    const testTypes = [
      { name: 'threshold-test', categoryPassed: true, numPassed: 3, numFailed: 1 },
    ];

    renderWithProviders(<RiskCard {...createTestProps({ testTypes })} />);

    const checkCircleIcon = document.querySelector('.lucide-circle-check-big');
    expect(checkCircleIcon).toBeInTheDocument();
  });

  it('should display CheckCircle icon when pluginPassRateThreshold is 0.5 and pass rate is between 0.5 and 1.0', () => {
    mockUseReportStore.mockReturnValue({
      showPercentagesOnRiskCards: false,
      pluginPassRateThreshold: 0.5,
      setShowPercentagesOnRiskCards: vi.fn(),
      setPluginPassRateThreshold: vi.fn(),
    });

    const testTypes = [{ name: 'test-type', categoryPassed: true, numPassed: 3, numFailed: 1 }];

    renderWithProviders(<RiskCard {...createTestProps({ testTypes })} />);

    const checkCircleIcon = document.querySelector('.lucide-circle-check-big');
    expect(checkCircleIcon).toBeInTheDocument();
  });
});
