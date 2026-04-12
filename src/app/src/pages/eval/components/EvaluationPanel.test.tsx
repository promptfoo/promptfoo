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

  it('renders assert-set rows as a nested hierarchy with assertion type and value labels', () => {
    const childResults: GradingResult[] = [
      {
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion: {
          type: 'contains',
          value: 'google_docs/batch_update',
        },
      },
      {
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion: {
          type: 'contains',
          value: 'google_docs/create_document',
        },
      },
    ];

    const gradingResults: GradingResult[] = [
      {
        pass: true,
        score: 1,
        reason: 'All assertions passed',
        componentResults: childResults,
        metadata: {
          assertionSet: {
            type: 'assert-set',
            metric: 'tool-calls',
            assertionCount: childResults.length,
          },
        },
      },
    ];

    const { container } = render(<EvaluationPanel gradingResults={gradingResults} />);

    expect(screen.getByText('Metric')).toBeInTheDocument();
    expect(screen.getByText('tool-calls')).toBeInTheDocument();
    expect(screen.getByText('assert-set')).toBeInTheDocument();
    expect(screen.getByText('2 nested assertions')).toBeInTheDocument();
    expect(screen.getAllByText('contains')).toHaveLength(2);
    expect(screen.getByText('google_docs/batch_update')).toBeInTheDocument();
    expect(screen.getByText('google_docs/create_document')).toBeInTheDocument();
    expect(container.querySelectorAll('.lucide-corner-down-right')).toHaveLength(2);
  });

  it('renders sibling rows after nested children when child results are not duplicated at top level', () => {
    const gradingResults: GradingResult[] = [
      {
        pass: true,
        score: 1,
        reason: 'Parent set passed',
        componentResults: [
          {
            pass: true,
            score: 1,
            reason: 'Nested child set passed',
            componentResults: [
              {
                pass: true,
                score: 1,
                reason: 'Deep child passed',
                assertion: {
                  type: 'contains',
                  value: 'deep-child',
                },
              },
            ],
            metadata: {
              assertionSet: {
                type: 'assert-set',
                metric: 'nested-tool-calls',
                assertionCount: 1,
              },
            },
          },
          {
            pass: false,
            score: 0,
            reason: 'Sibling child failed',
            assertion: {
              type: 'equals',
              value: 'expected-sibling',
            },
          },
        ],
        metadata: {
          assertionSet: {
            type: 'assert-set',
            metric: 'tool-calls',
            assertionCount: 2,
          },
        },
      },
    ];

    render(<EvaluationPanel gradingResults={gradingResults} />);

    expect(screen.getByText('nested-tool-calls')).toBeInTheDocument();
    expect(screen.getByText('deep-child')).toBeInTheDocument();
    expect(screen.getByText('equals')).toBeInTheDocument();
    expect(screen.getByText('expected-sibling')).toBeInTheDocument();
    expect(screen.getByText('Sibling child failed')).toBeInTheDocument();
  });

  it('ignores malformed assertion-set metadata and falls back to child result counts', () => {
    const gradingResults: GradingResult[] = [
      {
        pass: true,
        score: 1,
        reason: 'All assertions passed',
        componentResults: [
          {
            pass: true,
            score: 1,
            reason: 'Assertion passed',
            assertion: {
              type: 'contains',
              value: 'google_docs/create_document',
            },
          },
        ],
        metadata: {
          assertionSet: {
            type: 'assert-set',
            assertionCount: '1',
          },
        },
      },
    ];

    render(<EvaluationPanel gradingResults={gradingResults} />);

    expect(screen.getByText('assert-set')).toBeInTheDocument();
    expect(screen.getByText('1 nested assertion')).toBeInTheDocument();
    expect(screen.getByText('google_docs/create_document')).toBeInTheDocument();
  });
});
