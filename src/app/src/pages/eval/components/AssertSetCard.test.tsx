import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AssertSetCard } from './AssertSetCard';

import type { AssertionHierarchyResult } from './assertionHierarchy';

// Import the functions we're testing
// Note: These are not exported, so we test them indirectly through the component
// However, based on the task requirements, we should test getThresholdLabel and formatScoreThreshold

describe('AssertSetCard - getThresholdLabel logic', () => {
  it('describes default no-threshold behavior', () => {
    const result: AssertionHierarchyResult = {
      pass: true,
      score: 1,
      reason: 'All passed',
      assertion: { type: 'equals', metric: 'test-set' },
      metadata: { assertSetThreshold: undefined },
    };

    render(<AssertSetCard result={result} children={[]} />);

    expect(screen.getByText('(All assertions must pass)')).toBeInTheDocument();
  });

  it('displays an explicit full score threshold', () => {
    const result: AssertionHierarchyResult = {
      pass: true,
      score: 1,
      reason: 'All passed',
      assertion: { type: 'equals', metric: 'test-set' },
      metadata: { assertSetThreshold: 1 },
    };

    render(<AssertSetCard result={result} children={[]} />);

    expect(screen.getByText('(Required score: 100%)')).toBeInTheDocument();
  });

  it('does not describe a weighted score threshold as either-or', () => {
    const result: AssertionHierarchyResult = {
      pass: true,
      score: 0.5,
      reason: 'One passed',
      assertion: { type: 'equals', metric: 'either-or' },
      metadata: { assertSetThreshold: 0.5 },
    };

    render(<AssertSetCard result={result} children={[]} />);

    expect(screen.getByText('(Required score: 50%)')).toBeInTheDocument();
  });

  it('displays a low aggregate score threshold explicitly', () => {
    const result: AssertionHierarchyResult = {
      pass: true,
      score: 0.3,
      reason: 'At least one passed',
      assertion: { type: 'equals', metric: 'at-least-one' },
      metadata: { assertSetThreshold: 0.3 },
    };

    render(<AssertSetCard result={result} children={[]} />);

    expect(screen.getByText('(Required score: 30%)')).toBeInTheDocument();
  });

  it('does not infer child counts from a weighted score threshold', () => {
    const result: AssertionHierarchyResult = {
      pass: true,
      score: 0.75,
      reason: 'Most passed',
      assertion: { type: 'equals', metric: 'most-pass' },
      metadata: { assertSetThreshold: 0.75, childCount: 4 },
    };

    render(<AssertSetCard result={result} children={[]} />);

    expect(screen.getByText('(Required score: 75%)')).toBeInTheDocument();
  });

  it('displays a high aggregate score threshold explicitly', () => {
    const result: AssertionHierarchyResult = {
      pass: true,
      score: 0.8,
      reason: 'Most passed',
      assertion: { type: 'equals', metric: 'most-pass' },
      metadata: { assertSetThreshold: 0.8 },
    };

    render(<AssertSetCard result={result} children={[]} />);

    expect(screen.getByText('(Required score: 80%)')).toBeInTheDocument();
  });

  it('displays a zero score threshold explicitly', () => {
    const result: AssertionHierarchyResult = {
      pass: true,
      score: 1,
      reason: 'Passed',
      assertion: { type: 'equals', metric: 'test' },
      metadata: { assertSetThreshold: 0 },
    };

    render(<AssertSetCard result={result} children={[]} />);

    expect(screen.getByText('(Required score: 0%)')).toBeInTheDocument();
  });
});

describe('AssertSetCard - formatScoreThreshold logic', () => {
  it('displays score as percentage without threshold', () => {
    const result: AssertionHierarchyResult = {
      pass: true,
      score: 0.75,
      reason: 'Passed',
      assertion: { type: 'equals', metric: 'test' },
      metadata: {},
    };

    render(<AssertSetCard result={result} children={[]} />);

    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('displays score with >= comparison when score meets threshold', () => {
    const result: AssertionHierarchyResult = {
      pass: true,
      score: 0.75,
      reason: 'Passed',
      assertion: { type: 'equals', metric: 'test' },
      metadata: { assertSetThreshold: 0.5 },
    };

    render(<AssertSetCard result={result} children={[]} />);

    expect(screen.getByText('75% ≥ 50%')).toBeInTheDocument();
  });

  it('displays score with < comparison when score below threshold', () => {
    const result: AssertionHierarchyResult = {
      pass: false,
      score: 0.3,
      reason: 'Failed',
      assertion: { type: 'equals', metric: 'test' },
      metadata: { assertSetThreshold: 0.5 },
    };

    render(<AssertSetCard result={result} children={[]} />);

    expect(screen.getByText('30% < 50%')).toBeInTheDocument();
  });

  it('rounds percentages correctly', () => {
    const result: AssertionHierarchyResult = {
      pass: true,
      score: 0.667,
      reason: 'Passed',
      assertion: { type: 'equals', metric: 'test' },
      metadata: { assertSetThreshold: 0.333 },
    };

    render(<AssertSetCard result={result} children={[]} />);

    // Should round to nearest integer
    expect(screen.getByText('67% ≥ 33%')).toBeInTheDocument();
  });
});

describe('AssertSetCard component', () => {
  it('renders passed assert-set with green styling', () => {
    const result: AssertionHierarchyResult = {
      pass: true,
      score: 1,
      reason: 'All passed',
      assertion: { type: 'equals', metric: 'test-set' },
      metadata: { assertSetThreshold: 1 },
    };

    const { container } = render(<AssertSetCard result={result} children={[]} />);

    expect(screen.getByText('test-set')).toBeInTheDocument();
    const card = container.querySelector('.border-emerald-200');
    expect(card).toBeInTheDocument();
  });

  it('renders failed assert-set with red styling', () => {
    const result: AssertionHierarchyResult = {
      pass: false,
      score: 0.3,
      reason: 'Failed',
      assertion: { type: 'equals', metric: 'test-set' },
      metadata: { assertSetThreshold: 0.5 },
    };

    const { container } = render(<AssertSetCard result={result} children={[]} />);

    expect(screen.getByText('test-set')).toBeInTheDocument();
    const card = container.querySelector('.border-red-200');
    expect(card).toBeInTheDocument();
  });

  it('displays child assertions when expanded', async () => {
    const result: AssertionHierarchyResult = {
      pass: false,
      score: 0.5,
      reason: 'Some failed',
      assertion: { type: 'equals', metric: 'parent-set' },
      metadata: { assertSetThreshold: 1 },
    };

    const children: AssertionHierarchyResult[] = [
      {
        pass: true,
        score: 1,
        reason: 'Child 1 passed',
        assertion: { type: 'equals', metric: 'child-1' },
      },
      {
        pass: false,
        score: 0,
        reason: 'Child 2 failed',
        assertion: { type: 'equals', metric: 'child-2' },
      },
    ];

    render(<AssertSetCard result={result} children={children} defaultExpanded={true} />);

    expect(screen.getByText('child-1')).toBeInTheDocument();
    expect(screen.getByText('child-2')).toBeInTheDocument();
    expect(screen.getByText('1.00')).toBeInTheDocument();
    expect(screen.getByText('0.00')).toBeInTheDocument();
  });

  it('collapses and expands on click', async () => {
    const result: AssertionHierarchyResult = {
      pass: true,
      score: 1,
      reason: 'Passed',
      assertion: { type: 'equals', metric: 'parent-set' },
      metadata: { assertSetThreshold: 1 },
    };

    const children: AssertionHierarchyResult[] = [
      {
        pass: true,
        score: 1,
        reason: 'Child passed',
        assertion: { type: 'equals', metric: 'child' },
      },
    ];

    render(<AssertSetCard result={result} children={children} defaultExpanded={false} />);

    // Should not show children initially
    expect(screen.queryByText('child')).not.toBeInTheDocument();

    // Click to expand
    const header = screen.getByRole('button', { name: /parent-set/i });
    expect(header).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(header);

    // Should show children
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('child')).toBeInTheDocument();

    // Click to collapse
    await userEvent.click(header);

    // Should hide children again
    expect(screen.queryByText('child')).not.toBeInTheDocument();
  });

  it('defaults to expanded for failed assert-sets', () => {
    const result: AssertionHierarchyResult = {
      pass: false,
      score: 0,
      reason: 'Failed',
      assertion: { type: 'equals', metric: 'failed-set' },
      metadata: { assertSetThreshold: 1 },
    };

    const children: AssertionHierarchyResult[] = [
      {
        pass: false,
        score: 0,
        reason: 'Child failed',
        assertion: { type: 'equals', metric: 'child' },
      },
    ];

    render(<AssertSetCard result={result} children={children} />);

    // Should show children by default for failed sets
    expect(screen.getByText('child')).toBeInTheDocument();
  });

  it('defaults to collapsed for passed assert-sets', () => {
    const result: AssertionHierarchyResult = {
      pass: true,
      score: 1,
      reason: 'Passed',
      assertion: { type: 'equals', metric: 'passed-set' },
      metadata: { assertSetThreshold: 1 },
    };

    const children: AssertionHierarchyResult[] = [
      {
        pass: true,
        score: 1,
        reason: 'Child passed',
        assertion: { type: 'equals', metric: 'child' },
      },
    ];

    render(<AssertSetCard result={result} children={children} />);

    // Should not show children by default for passed sets
    expect(screen.queryByText('child')).not.toBeInTheDocument();
  });

  it('shows neutral indicator for failed children when parent passed', () => {
    const result: AssertionHierarchyResult = {
      pass: true,
      score: 0.5,
      reason: 'Either/Or passed',
      assertion: { type: 'equals', metric: 'either-or' },
      metadata: { assertSetThreshold: 0.5 },
    };

    const children: AssertionHierarchyResult[] = [
      {
        pass: true,
        score: 1,
        reason: 'Child 1 passed',
        assertion: { type: 'equals', metric: 'child-1' },
      },
      {
        pass: false,
        score: 0,
        reason: 'Child 2 failed',
        assertion: { type: 'equals', metric: 'child-2' },
      },
    ];

    render(<AssertSetCard result={result} children={children} defaultExpanded={true} />);

    expect(screen.getByText('child-1')).toBeInTheDocument();
    expect(screen.getByText('child-2')).toBeInTheDocument();
    // The neutral indicator should show "(not required - parent passed)" text
    expect(screen.getByText(/not required - parent passed/)).toBeInTheDocument();
  });

  it('uses assertSetMetric from metadata as fallback', () => {
    const result: AssertionHierarchyResult = {
      pass: true,
      score: 1,
      reason: 'Passed',
      assertion: { type: 'equals' },
      metadata: { assertSetMetric: 'metadata-metric', assertSetThreshold: 1 },
    };

    render(<AssertSetCard result={result} children={[]} />);

    expect(screen.getByText('metadata-metric')).toBeInTheDocument();
  });

  it('uses threshold from assertion as fallback', () => {
    const result: AssertionHierarchyResult = {
      pass: true,
      score: 1,
      reason: 'Passed',
      assertion: { type: 'equals', metric: 'test', threshold: 0.8 },
      metadata: {},
    };

    render(<AssertSetCard result={result} children={[]} />);

    // Should use threshold from assertion
    expect(screen.getByText('100% ≥ 80%')).toBeInTheDocument();
  });

  it('displays "assert-set" as default metric name', () => {
    const result: AssertionHierarchyResult = {
      pass: true,
      score: 1,
      reason: 'Passed',
      assertion: { type: 'equals' },
      metadata: {},
    };

    render(<AssertSetCard result={result} children={[]} />);

    expect(screen.getByText('assert-set')).toBeInTheDocument();
  });

  it('displays child assertion type as fallback for metric', () => {
    const result: AssertionHierarchyResult = {
      pass: true,
      score: 1,
      reason: 'Passed',
      assertion: { type: 'equals', metric: 'parent' },
      metadata: { assertSetThreshold: 1 },
    };

    const children: AssertionHierarchyResult[] = [
      {
        pass: true,
        score: 1,
        reason: 'Passed',
        assertion: { type: 'equals' },
      },
    ];

    render(<AssertSetCard result={result} children={children} defaultExpanded={true} />);

    expect(screen.getByText('equals')).toBeInTheDocument();
  });
});
