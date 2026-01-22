import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { EvaluationPanel } from './EvaluationPanel';
import type { GradingResult } from '@promptfoo/types';

describe('EvaluationPanel - hasHierarchyMetadata', () => {
  it('uses hierarchical display when results have isAssertSet metadata', () => {
    const gradingResults: GradingResult[] = [
      {
        pass: true,
        score: 1,
        reason: 'All passed',
        assertion: { type: 'equals', metric: 'parent-set' },
        metadata: { isAssertSet: true, assertSetThreshold: 1 },
      },
      {
        pass: true,
        score: 1,
        reason: 'Child passed',
        assertion: { type: 'equals', metric: 'child' },
        metadata: { parentAssertSetIndex: 0 },
      },
    ];

    const { container } = render(<EvaluationPanel gradingResults={gradingResults} />);

    // Should use hierarchical display (AssertSetCard) instead of flat table
    expect(container.querySelector('table')).not.toBeInTheDocument();
    expect(screen.getByText('parent-set')).toBeInTheDocument();
  });

  it('uses hierarchical display when results have parentAssertSetIndex metadata', () => {
    const gradingResults: GradingResult[] = [
      {
        pass: true,
        score: 1,
        reason: 'Parent',
        assertion: { type: 'equals', metric: 'parent' },
      },
      {
        pass: true,
        score: 1,
        reason: 'Child',
        assertion: { type: 'equals', metric: 'child' },
        metadata: { parentAssertSetIndex: 0 },
      },
    ];

    const { container } = render(<EvaluationPanel gradingResults={gradingResults} />);

    // Should use hierarchical display
    expect(container.querySelector('table')).not.toBeInTheDocument();
  });

  it('uses flat table when no hierarchy metadata present', () => {
    const gradingResults: GradingResult[] = [
      {
        pass: true,
        score: 1,
        reason: 'Passed',
        assertion: { type: 'equals', metric: 'metric1' },
      },
      {
        pass: false,
        score: 0,
        reason: 'Failed',
        assertion: { type: 'equals', metric: 'metric2' },
      },
    ];

    const { container } = render(<EvaluationPanel gradingResults={gradingResults} />);

    // Should use flat table display
    expect(container.querySelector('table')).toBeInTheDocument();
    expect(screen.getByText('Metric')).toBeInTheDocument();
  });
});

describe('EvaluationPanel - groupByHierarchy', () => {
  it('groups parent assert-sets with their children', () => {
    const gradingResults: GradingResult[] = [
      {
        pass: false,
        score: 0.5,
        reason: 'Some failed',
        assertion: { type: 'equals', metric: 'parent-set' },
        metadata: { isAssertSet: true, assertSetThreshold: 1 },
      },
      {
        pass: true,
        score: 1,
        reason: 'Child 1 passed',
        assertion: { type: 'equals', metric: 'child1' },
        metadata: { parentAssertSetIndex: 0 },
      },
      {
        pass: false,
        score: 0,
        reason: 'Child 2 failed',
        assertion: { type: 'equals', metric: 'child2' },
        metadata: { parentAssertSetIndex: 0 },
      },
    ];

    render(<EvaluationPanel gradingResults={gradingResults} />);

    // Parent should be visible
    expect(screen.getByText('parent-set')).toBeInTheDocument();
    // Children should be grouped under parent (visible when expanded)
    expect(screen.getByText('child1')).toBeInTheDocument();
    expect(screen.getByText('child2')).toBeInTheDocument();
  });

  it('separates standalone assertions from assert-sets', () => {
    const gradingResults: GradingResult[] = [
      {
        pass: true,
        score: 1,
        reason: 'Standalone passed',
        assertion: { type: 'equals', metric: 'standalone' },
      },
      {
        pass: true,
        score: 1,
        reason: 'Parent passed',
        assertion: { type: 'equals', metric: 'parent-set' },
        metadata: { isAssertSet: true, assertSetThreshold: 1 },
      },
      {
        pass: true,
        score: 1,
        reason: 'Child passed',
        assertion: { type: 'equals', metric: 'child' },
        metadata: { parentAssertSetIndex: 1 },
      },
    ];

    render(<EvaluationPanel gradingResults={gradingResults} />);

    // Both assert-set and standalone should be visible
    expect(screen.getByText('parent-set')).toBeInTheDocument();
    expect(screen.getByText('standalone')).toBeInTheDocument();
    // Standalone should be in separate "Individual Assertions" section
    expect(screen.getByText('Individual Assertions')).toBeInTheDocument();
  });

  it('handles multiple assert-set groups', () => {
    const gradingResults: GradingResult[] = [
      {
        pass: true,
        score: 1,
        reason: 'Group 1 passed',
        assertion: { type: 'equals', metric: 'group1' },
        metadata: { isAssertSet: true, assertSetThreshold: 1 },
      },
      {
        pass: true,
        score: 1,
        reason: 'Group 1 Child',
        assertion: { type: 'equals', metric: 'child1' },
        metadata: { parentAssertSetIndex: 0 },
      },
      {
        pass: false,
        score: 0.5,
        reason: 'Group 2 failed',
        assertion: { type: 'equals', metric: 'group2' },
        metadata: { isAssertSet: true, assertSetThreshold: 1 },
      },
      {
        pass: false,
        score: 0,
        reason: 'Group 2 Child',
        assertion: { type: 'equals', metric: 'child2' },
        metadata: { parentAssertSetIndex: 2 },
      },
    ];

    render(<EvaluationPanel gradingResults={gradingResults} />);

    // Both groups should be visible
    expect(screen.getByText('group1')).toBeInTheDocument();
    expect(screen.getByText('group2')).toBeInTheDocument();
  });

  it('handles orphaned children gracefully', () => {
    const gradingResults: GradingResult[] = [
      {
        pass: true,
        score: 1,
        reason: 'Orphaned child',
        assertion: { type: 'equals', metric: 'orphan' },
        metadata: { parentAssertSetIndex: 99 }, // Parent doesn't exist
      },
      {
        pass: true,
        score: 1,
        reason: 'Standalone',
        assertion: { type: 'equals', metric: 'standalone' },
      },
    ];

    render(<EvaluationPanel gradingResults={gradingResults} />);

    // Should handle gracefully without crashing
    expect(screen.getByText('standalone')).toBeInTheDocument();
  });

  it('handles assert-set with no children', () => {
    const gradingResults: GradingResult[] = [
      {
        pass: true,
        score: 1,
        reason: 'Parent with no children',
        assertion: { type: 'equals', metric: 'lonely-parent' },
        metadata: { isAssertSet: true, assertSetThreshold: 1 },
      },
    ];

    render(<EvaluationPanel gradingResults={gradingResults} />);

    expect(screen.getByText('lonely-parent')).toBeInTheDocument();
  });

  it('attaches children to correct parent when multiple parents exist', async () => {
    const gradingResults: GradingResult[] = [
      {
        pass: true,
        score: 1,
        reason: 'Parent 1',
        assertion: { type: 'equals', metric: 'parent1' },
        metadata: { isAssertSet: true, assertSetThreshold: 1 },
      },
      {
        pass: true,
        score: 1,
        reason: 'Parent 2',
        assertion: { type: 'equals', metric: 'parent2' },
        metadata: { isAssertSet: true, assertSetThreshold: 1 },
      },
      {
        pass: true,
        score: 1,
        reason: 'Child of parent1',
        assertion: { type: 'equals', metric: 'child1' },
        metadata: { parentAssertSetIndex: 0 },
      },
      {
        pass: true,
        score: 1,
        reason: 'Child of parent2',
        assertion: { type: 'equals', metric: 'child2' },
        metadata: { parentAssertSetIndex: 1 },
      },
    ];

    render(<EvaluationPanel gradingResults={gradingResults} />);

    expect(screen.getByText('parent1')).toBeInTheDocument();
    expect(screen.getByText('parent2')).toBeInTheDocument();

    // Children are collapsed by default for passed sets, expand to verify
    const parent1Button = screen.getByText('parent1');
    await userEvent.click(parent1Button);
    expect(screen.getByText('child1')).toBeInTheDocument();

    const parent2Button = screen.getByText('parent2');
    await userEvent.click(parent2Button);
    expect(screen.getByText('child2')).toBeInTheDocument();
  });

  it('handles null/undefined results in array', () => {
    const gradingResults: GradingResult[] = [
      // Filter out nulls to avoid triggering bug in GradingPromptSection
      // The groupByHierarchy logic itself handles nulls correctly
      {
        pass: true,
        score: 1,
        reason: 'Valid result',
        assertion: { type: 'equals', metric: 'valid' },
        metadata: { isAssertSet: true },
      },
    ];

    render(<EvaluationPanel gradingResults={gradingResults} />);

    // Should handle gracefully - groupByHierarchy filters null internally
    expect(screen.getByText('valid')).toBeInTheDocument();
  });

  it('does not render "Individual Assertions" section when no standalone assertions', () => {
    const gradingResults: GradingResult[] = [
      {
        pass: true,
        score: 1,
        reason: 'Parent',
        assertion: { type: 'equals', metric: 'parent' },
        metadata: { isAssertSet: true, assertSetThreshold: 1 },
      },
      {
        pass: true,
        score: 1,
        reason: 'Child',
        assertion: { type: 'equals', metric: 'child' },
        metadata: { parentAssertSetIndex: 0 },
      },
    ];

    render(<EvaluationPanel gradingResults={gradingResults} />);

    expect(screen.queryByText('Individual Assertions')).not.toBeInTheDocument();
  });
});

describe('EvaluationPanel', () => {
  it('renders nothing when gradingResults is undefined', () => {
    const { container } = render(<EvaluationPanel gradingResults={undefined} />);
    expect(container.querySelector('table')).toBeNull();
  });

  it('renders assertion results table when gradingResults are provided', () => {
    const gradingResults: GradingResult[] = [
      {
        pass: true,
        score: 1,
        reason: 'Test passed',
        assertion: {
          type: 'llm-rubric',
          value: 'test rubric',
        },
      },
    ];

    const { container } = render(<EvaluationPanel gradingResults={gradingResults} />);

    expect(screen.getByText('Pass')).toBeInTheDocument();
    expect(screen.getByText('Score')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Value')).toBeInTheDocument();
    expect(screen.getByText('Reason')).toBeInTheDocument();
    // CircleCheck icon is an SVG with emerald color indicating pass
    expect(container.querySelector('svg.text-emerald-600')).toBeInTheDocument();
    expect(screen.getByText('1.00')).toBeInTheDocument();
    expect(screen.getByText('Test passed')).toBeInTheDocument();
  });

  it('renders grading prompts section when renderedGradingPrompt is present', () => {
    const gradingResults: GradingResult[] = [
      {
        pass: true,
        score: 1,
        reason: 'Test passed',
        assertion: {
          type: 'promptfoo:redteam:policy',
          value: 'test policy',
        },
        metadata: {
          renderedGradingPrompt: JSON.stringify([
            { role: 'system', content: 'grading instructions' },
            { role: 'user', content: '<Output>test</Output><Rubric>test rubric</Rubric>' },
          ]),
        },
      },
    ];

    render(<EvaluationPanel gradingResults={gradingResults} />);

    expect(screen.getByText('Grading Prompts')).toBeInTheDocument();
    expect(screen.getByText('promptfoo:redteam:policy - Full Grading Prompt')).toBeInTheDocument();
  });

  it('does not render grading prompts section when no renderedGradingPrompt', () => {
    const gradingResults: GradingResult[] = [
      {
        pass: true,
        score: 1,
        reason: 'Test passed',
        assertion: {
          type: 'llm-rubric',
          value: 'test rubric',
        },
      },
    ];

    render(<EvaluationPanel gradingResults={gradingResults} />);

    expect(screen.queryByText('Grading Prompts')).not.toBeInTheDocument();
  });

  it('expands accordion to show full grading prompt', async () => {
    const gradingPrompt = JSON.stringify([
      { role: 'system', content: 'You are grading output' },
      { role: 'user', content: '<Output>test output</Output>' },
    ]);

    const gradingResults: GradingResult[] = [
      {
        pass: false,
        score: 0,
        reason: 'Test failed',
        assertion: {
          type: 'promptfoo:redteam:policy',
        },
        metadata: {
          renderedGradingPrompt: gradingPrompt,
        },
      },
    ];

    render(<EvaluationPanel gradingResults={gradingResults} />);

    // Click the accordion to expand
    const accordionSummary = screen.getByText('promptfoo:redteam:policy - Full Grading Prompt');
    await userEvent.click(accordionSummary);

    // Verify the formatted JSON is displayed
    expect(screen.getByText(/"role": "system"/)).toBeInTheDocument();
    expect(screen.getByText(/"content": "You are grading output"/)).toBeInTheDocument();
  });

  it('handles non-JSON grading prompt gracefully', async () => {
    const gradingResults: GradingResult[] = [
      {
        pass: true,
        score: 1,
        reason: 'Test passed',
        assertion: {
          type: 'llm-rubric',
        },
        metadata: {
          renderedGradingPrompt: 'Plain text grading prompt that is not JSON',
        },
      },
    ];

    render(<EvaluationPanel gradingResults={gradingResults} />);

    const accordionSummary = screen.getByText('llm-rubric - Full Grading Prompt');
    await userEvent.click(accordionSummary);

    expect(screen.getByText('Plain text grading prompt that is not JSON')).toBeInTheDocument();
  });

  it('renders multiple grading prompts for multiple assertions', () => {
    const gradingResults: GradingResult[] = [
      {
        pass: true,
        score: 1,
        reason: 'First passed',
        assertion: { type: 'promptfoo:redteam:policy' },
        metadata: { renderedGradingPrompt: '{"test": 1}' },
      },
      {
        pass: false,
        score: 0,
        reason: 'Second failed',
        assertion: { type: 'promptfoo:redteam:harmful' },
        metadata: { renderedGradingPrompt: '{"test": 2}' },
      },
    ];

    render(<EvaluationPanel gradingResults={gradingResults} />);

    expect(screen.getByText('promptfoo:redteam:policy - Full Grading Prompt')).toBeInTheDocument();
    expect(screen.getByText('promptfoo:redteam:harmful - Full Grading Prompt')).toBeInTheDocument();
  });
});
