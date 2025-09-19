import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RiskCategories from './RiskCategories';
import { categoryDescriptions, riskCategories } from '@promptfoo/redteam/constants';

const mockRiskCardProps: any[] = [];
vi.mock('./RiskCard', () => ({
  default: vi.fn((props) => {
    mockRiskCardProps.push(props);
    return <div data-testid="mock-risk-card">{props.title}</div>;
  }),
}));

const createMockProps = (overrides = {}) => ({
  evalId: 'eval-id-123',
  categoryStats: {},
  failuresByPlugin: {},
  passesByPlugin: {},
  strategyStats: {},
  ...overrides,
});

const expectRiskCardProps = (title: string, expectedProps: Record<string, unknown>) => {
  const cardProps = mockRiskCardProps.find((p) => p.title === title);
  expect(cardProps).toBeDefined();

  Object.entries(expectedProps).forEach(([key, value]) => {
    if (key === 'progressValue') {
      expect(cardProps[key]).toBeCloseTo(value as number);
    } else if (key === 'testTypes') {
      expect(cardProps[key]).toEqual(expect.arrayContaining(value as unknown[]));
    } else {
      expect(cardProps[key]).toEqual(value);
    }
  });

  return cardProps;
};

describe('RiskCategories', () => {
  beforeEach(() => {
    mockRiskCardProps.length = 0;
    vi.clearAllMocks();
  });

  it('should render a RiskCard for each top-level risk category with correctly aggregated props', () => {
    const mockProps = createMockProps({
      categoryStats: {
        'sql-injection': { pass: 8, total: 10 },
        rbac: { pass: 5, total: 5 },
        contracts: { pass: 3, total: 4 },
        'harmful:hate': { pass: 0, total: 2 },
      },
      failuresByPlugin: {
        'sql-injection': [{ prompt: 'p1', output: 'o1' }],
        'harmful:hate': [
          { prompt: 'p2', output: 'o2' },
          { prompt: 'p3', output: 'o3' },
        ],
      },
      passesByPlugin: {
        rbac: [{ prompt: 'p4', output: 'o4' }],
      },
      strategyStats: {
        'strategy-a': { pass: 1, total: 2 },
      },
    });

    render(<RiskCategories {...mockProps} />);

    const expectedCategoryCount = Object.keys(riskCategories).length;
    const renderedCards = screen.getAllByTestId('mock-risk-card');
    expect(renderedCards).toHaveLength(expectedCategoryCount);
    expect(mockRiskCardProps).toHaveLength(expectedCategoryCount);

    const totalPasses = 8 + 5;
    const totalTests = 10 + 5;
    const expectedProgress = (totalPasses / totalTests) * 100;

    expectRiskCardProps('Security & Access Control', {
      subtitle: categoryDescriptions['Security & Access Control'],
      progressValue: expectedProgress,
      numTestsPassed: totalPasses,
      numTestsFailed: totalTests - totalPasses,
      evalId: mockProps.evalId,
      testTypes: [
        expect.objectContaining({
          name: 'sql-injection',
          categoryPassed: false,
          numPassed: 8,
          numFailed: 2,
        }),
        expect.objectContaining({
          name: 'rbac',
          categoryPassed: true,
          numPassed: 5,
          numFailed: 0,
        }),
        expect.objectContaining({
          name: 'bfla',
          categoryPassed: false,
          numPassed: 0,
          numFailed: 0,
        }),
      ],
    });
  });

  it('should render a RiskCard with zero numTestsPassed and numTestsFailed, and a testTypes array containing entries with zero numPassed and numFailed, for any category whose subcategories are missing from categoryStats', () => {
    const mockProps = createMockProps({
      categoryStats: {
        contracts: { pass: 3, total: 4 },
        'harmful:hate': { pass: 0, total: 2 },
      },
    });

    render(<RiskCategories {...mockProps} />);

    expectRiskCardProps('Security & Access Control', {
      numTestsPassed: 0,
      numTestsFailed: 0,
      testTypes: riskCategories['Security & Access Control'].map((subCategory) => ({
        name: subCategory,
        categoryPassed: false,
        numPassed: 0,
        numFailed: 0,
      })),
    });
  });

  it('should pass evalId, failuresByPlugin, passesByPlugin, and strategyStats props unchanged to each RiskCard', () => {
    const mockEvalId = 'test-eval-id';
    const mockFailuresByPlugin = {
      'plugin-a': [{ prompt: 'prompt-a', output: 'output-a' }],
    };
    const mockPassesByPlugin = {
      'plugin-b': [{ prompt: 'prompt-b', output: 'output-b' }],
    };
    const mockStrategyStats = {
      'strategy-x': { pass: 5, total: 10 },
    };
    const mockCategoryStats = {
      'plugin-a': { pass: 1, total: 2 },
      'plugin-b': { pass: 3, total: 4 },
    };

    const mockProps = createMockProps({
      evalId: mockEvalId,
      failuresByPlugin: mockFailuresByPlugin,
      passesByPlugin: mockPassesByPlugin,
      strategyStats: mockStrategyStats,
      categoryStats: mockCategoryStats,
    });

    render(<RiskCategories {...mockProps} />);

    const expectedCategoryCount = Object.keys(riskCategories).length;
    expect(mockRiskCardProps).toHaveLength(expectedCategoryCount);

    mockRiskCardProps.forEach((props) => {
      expect(props.evalId).toBe(mockEvalId);
      expect(props.failuresByPlugin).toBe(mockFailuresByPlugin);
      expect(props.passesByPlugin).toBe(mockPassesByPlugin);
      expect(props.strategyStats).toBe(mockStrategyStats);
    });
  });

  it.each([
    {
      name: 'missing subcategories',
      categoryStats: {
        'sql-injection': { pass: 8, total: 10 },
      },
      expectedTestTypes: [
        { name: 'sql-injection', categoryPassed: false, numPassed: 8, numFailed: 2 },
        { name: 'rbac', categoryPassed: false, numPassed: 0, numFailed: 0 },
        { name: 'bfla', categoryPassed: false, numPassed: 0, numFailed: 0 },
      ],
    },
    {
      name: 'subcategories with zero tests',
      categoryStats: {
        'sql-injection': { pass: 5, total: 5 },
        rbac: { pass: 0, total: 0 },
      },
      expectedTestTypes: [
        { name: 'sql-injection', categoryPassed: true, numPassed: 5, numFailed: 0 },
        { name: 'rbac', categoryPassed: false, numPassed: 0, numFailed: 0 },
        { name: 'bfla', categoryPassed: false, numPassed: 0, numFailed: 0 },
      ],
      expectedProgress: 100,
      expectedPasses: 5,
      expectedFails: 0,
    },
    {
      name: 'all subcategories with zero tests',
      categoryStats: {
        'sql-injection': { pass: 0, total: 0 },
        rbac: { pass: 0, total: 0 },
        bfla: { pass: 0, total: 0 },
      },
      expectedTestTypes: [
        { name: 'sql-injection', categoryPassed: false, numPassed: 0, numFailed: 0 },
        { name: 'rbac', categoryPassed: false, numPassed: 0, numFailed: 0 },
        { name: 'bfla', categoryPassed: false, numPassed: 0, numFailed: 0 },
      ],
      expectedProgress: 0,
      expectedPasses: 0,
      expectedFails: 0,
    },
    {
      name: 'negative values in categoryStats',
      categoryStats: {
        'sql-injection': { pass: -5, total: 10 },
        rbac: { pass: 5, total: -5 },
      },
    },
  ])(
    'should handle $name gracefully',
    ({ categoryStats, expectedTestTypes, expectedProgress, expectedPasses, expectedFails }) => {
      const mockProps = createMockProps({ categoryStats });

      render(<RiskCategories {...mockProps} />);

      const securityCardProps = expectRiskCardProps('Security & Access Control', {});

      expect(typeof securityCardProps.progressValue).toBe('number');
      expect(Number.isNaN(securityCardProps.progressValue)).toBe(false);

      if (expectedTestTypes) {
        expectedTestTypes.forEach((type) => {
          expect(securityCardProps.testTypes).toEqual(
            expect.arrayContaining([expect.objectContaining(type)]),
          );
        });
      }

      if (expectedProgress !== undefined) {
        expect(securityCardProps.progressValue).toBeCloseTo(expectedProgress);
      }

      if (expectedPasses !== undefined) {
        expect(securityCardProps.numTestsPassed).toBe(expectedPasses);
      }

      if (expectedFails !== undefined) {
        expect(securityCardProps.numTestsFailed).toBe(expectedFails);
      }
    },
  );

  it('should handle failuresByPlugin and passesByPlugin containing entries for subcategories not defined in riskCategories', () => {
    const mockProps = createMockProps({
      failuresByPlugin: {
        'undefined-subcategory': [{ prompt: 'p1', output: 'o1' }],
      },
      passesByPlugin: {
        'another-undefined-subcategory': [{ prompt: 'p2', output: 'o2' }],
      },
    });

    render(<RiskCategories {...mockProps} />);

    const renderedCards = screen.getAllByTestId('mock-risk-card');
    expect(renderedCards).toHaveLength(Object.keys(riskCategories).length);

    Object.values(mockRiskCardProps).forEach((riskCardProps) => {
      expect(riskCardProps.failuresByPlugin).toEqual(mockProps.failuresByPlugin);
      expect(riskCardProps.passesByPlugin).toEqual(mockProps.passesByPlugin);
    });
  });

  it('should handle floating point precision issues when calculating progressValue', () => {
    const totalTests = 1000000;
    const totalPasses = 999999;

    const subCategory = 'ascii-smuggling';

    const mockProps = createMockProps({
      categoryStats: {
        [subCategory]: { pass: totalPasses, total: totalTests },
      },
    });

    render(<RiskCategories {...mockProps} />);

    const expectedProgress = (totalPasses / totalTests) * 100;
    expectRiskCardProps(Object.keys(riskCategories)[0], {
      progressValue: expectedProgress,
    });
  });
});
