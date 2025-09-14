import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

vi.mock('@promptfoo/redteam/constants', async (importOriginal) => {
  const original = await importOriginal<typeof import('@promptfoo/redteam/constants')>();
  const longName = 'this-is-an-extremely-long-test-type-name-that-should-wrap-correctly-in-the-ui';
  return {
    ...original,
    displayNameOverrides: {
      'sql-injection': 'SQL Injection',
      xss: 'Cross-Site Scripting',
      'no-failures': 'No Failures Test',
      [longName]: longName,
    },
    categoryAliases: {
      'sql-injection': 'SqlInjection',
      xss: 'XSS',
      'no-failures': 'NoFailures',
      [longName]: longName,
    },
    subCategoryDescriptions: {
      'sql-injection': 'Tests for SQL injection vulnerabilities',
      xss: 'Tests for Cross-Site Scripting vulnerabilities',
      'no-failures': 'Tests with no failures',
      [longName]: 'Tests for extremely long test type names',
    },
  };
});

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
      { name: 'xss', categoryPassed: true, numPassed: 5, numFailed: 5 },
    ],
    evalId: 'test-eval-id',
    failuresByPlugin: {
      'sql-injection': [{ prompt: 'prompt1', output: 'output1' }],
      xss: [{ prompt: 'prompt2', output: 'output2' }],
    },
    passesByPlugin: {
      'sql-injection': [{ prompt: 'prompt3', output: 'output3' }],
      xss: [{ prompt: 'prompt4', output: 'output4' }],
    },
    strategyStats: { strategy1: { pass: 2, total: 3 } },
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
    render(<RiskCard {...props} />);

    expect(screen.getByText('Security Risks')).toBeInTheDocument();

    expect(screen.getByText('Analysis of potential vulnerabilities')).toBeInTheDocument();

    const expectedGaugeText = `${Math.round(props.progressValue)}%`;
    expect(screen.getByText(expectedGaugeText)).toBeInTheDocument();
  });

  it('should render nothing (return null) if all testTypes have numPassed and numFailed equal to 0', () => {
    const props = createTestProps({
      testTypes: [
        { name: 'sql-injection', categoryPassed: false, numPassed: 0, numFailed: 0 },
        { name: 'xss', categoryPassed: true, numPassed: 0, numFailed: 0 },
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
    render(<RiskCard {...props} />);

    expect(screen.getByText(`${numTestsFailed} failed probes`)).toBeInTheDocument();
    expect(
      screen.getByText(`${numTestsPassed}/${numTestsPassed + numTestsFailed} passed`),
    ).toBeInTheDocument();
  });

  it('should render a list of test types with their display names and pass/fail indicators for each filtered testType', () => {
    const testTypes = [
      { name: 'sql-injection', categoryPassed: true, numPassed: 8, numFailed: 2 },
      { name: 'xss', categoryPassed: false, numPassed: 3, numFailed: 7 },
    ];

    render(<RiskCard {...createTestProps({ testTypes })} />);

    expect(screen.getByText('SQL Injection')).toBeInTheDocument();
    expect(screen.getByText('Cross-Site Scripting')).toBeInTheDocument();
  });

  it('should open the RiskCategoryDrawer with the correct category and test data when a test type list item is clicked', () => {
    render(<RiskCard {...defaultProps} />);

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
    expect(RiskCategoryDrawerMock.mockProps.strategyStats).toEqual(defaultProps.strategyStats);
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
      { name: 'xss', categoryPassed: true, numPassed: 7, numFailed: 3 },
    ];

    render(<RiskCard {...createTestProps({ testTypes })} />);

    const expectedSqlInjectionPercentage = `${Math.round((2 / (2 + 8)) * 100)}%`;
    const expectedXSSPercentage = `${Math.round((7 / (7 + 3)) * 100)}%`;

    expect(screen.getByText(expectedSqlInjectionPercentage)).toBeInTheDocument();
    expect(screen.getByText(expectedXSSPercentage)).toBeInTheDocument();
  });

  it("should apply 'risk-card-percentage-high' class when percentage is greater than or equal to 0.8 and showPercentagesOnRiskCards is true", () => {
    mockUseReportStore.mockReturnValue({
      showPercentagesOnRiskCards: true,
      pluginPassRateThreshold: 1.0,
      setShowPercentagesOnRiskCards: vi.fn(),
      setPluginPassRateThreshold: vi.fn(),
    });

    const props = createTestProps({
      testTypes: [{ name: 'sql-injection', categoryPassed: true, numPassed: 8, numFailed: 2 }],
    });

    render(<RiskCard {...props} />);

    const percentageElement = screen.getByText('80%');
    expect(percentageElement).toHaveClass('risk-card-percentage-high');
  });

  it('should display "-" when progressValue is NaN', () => {
    const props = createTestProps({
      progressValue: NaN,
    });
    render(<RiskCard {...props} />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('should display the default tooltip when a test type name is not found in subCategoryDescriptions', () => {
    const props = createTestProps({
      testTypes: [{ name: 'unknown-test-type', categoryPassed: false, numPassed: 0, numFailed: 1 }],
    });

    render(<RiskCard {...props} />);

    const tooltipElement = screen.getByLabelText('Click to view details');

    expect(tooltipElement).toBeInTheDocument();
  });

  it("should handle strategyStats containing strategies that don't match any testType names", () => {
    const props = createTestProps({
      strategyStats: {
        'unknown-strategy': { pass: 2, total: 10 },
      },
    });

    render(<RiskCard {...props} />);

    expect(screen.getByText('Default Title')).toBeInTheDocument();
  });

  it('should handle test types with extremely long names without breaking the UI layout', () => {
    const longTestTypeName =
      'this-is-an-extremely-long-test-type-name-that-should-wrap-correctly-in-the-ui';
    const props = createTestProps({
      testTypes: [{ name: longTestTypeName, categoryPassed: true, numPassed: 1, numFailed: 0 }],
    });
    render(<RiskCard {...props} />);

    const listItemText = screen.getByText(longTestTypeName);
    expect(listItemText).toBeInTheDocument();
  });

  it('should render correctly when failuresByPlugin and passesByPlugin are empty objects', () => {
    const props = createTestProps({
      failuresByPlugin: {},
      passesByPlugin: {},
    });

    render(<RiskCard {...props} />);

    expect(screen.getByText(props.title)).toBeInTheDocument();
    expect(screen.getByText(props.subtitle)).toBeInTheDocument();
  });

  it('should open the RiskCategoryDrawer when a test type with no failures is clicked', () => {
    const props = createTestProps({
      testTypes: [{ name: 'no-failures', categoryPassed: true, numPassed: 10, numFailed: 0 }],
    });
    render(<RiskCard {...props} />);

    const listItem = screen.getByText('No Failures Test').closest('li');
    fireEvent.click(listItem as Element);

    expect(screen.getByTestId('mock-risk-category-drawer')).toBeInTheDocument();
  });
});
