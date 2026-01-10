import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { EvaluationPanel } from './EvaluationPanel';
import type { GradingResult } from '@promptfoo/types';

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
