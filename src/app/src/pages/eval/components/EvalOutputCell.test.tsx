import { render, screen } from '@testing-library/react';
import type { AssertionType, EvaluateTableOutput } from '@promptfoo/types';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ShiftKeyProvider } from '../../../contexts/ShiftKeyContext';
import type { EvalOutputCellProps } from './EvalOutputCell';
import EvalOutputCell from './EvalOutputCell';

vi.mock('./store', () => ({
  useStore: () => ({
    prettifyJson: false,
    renderMarkdown: true,
    showPassFail: true,
    showPrompts: true,
  }),
}));

vi.mock('../../../hooks/useShiftKey', () => ({
  useShiftKey: () => true,
}));

interface MockEvalOutputCellProps extends EvalOutputCellProps {
  firstOutput: EvaluateTableOutput;
  searchText: string;
  showDiffs: boolean;
}

describe('EvalOutputCell', () => {
  const mockOnRating = vi.fn();

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(<ShiftKeyProvider>{ui}</ShiftKeyProvider>);
  };

  const defaultProps: MockEvalOutputCellProps = {
    firstOutput: {
      cost: 0,
      id: 'test-id',
      latencyMs: 100,
      namedScores: {},
      pass: true,
      prompt: 'Test prompt',
      provider: 'test-provider',
      score: 0.8,
      text: 'Test output text',
    },
    maxTextLength: 100,
    onRating: mockOnRating,
    output: {
      cost: 0,
      gradingResult: {
        comment: 'Initial comment',
        componentResults: [
          {
            assertion: {
              metric: 'accuracy',
              type: 'contains' as AssertionType,
              value: 'expected value',
            },
            pass: true,
            reason: 'Perfect match',
            score: 1.0,
          },
          {
            assertion: {
              metric: 'relevance',
              type: 'similar',
              value: 'another value',
            },
            pass: false,
            reason: 'Partial match',
            score: 0.6,
          },
        ],
        pass: true,
        reason: 'Test reason',
        score: 0.8,
      },
      id: 'test-id',
      latencyMs: 100,
      namedScores: {},
      pass: true,
      prompt: 'Test prompt',
      provider: 'test-provider',
      score: 0.8,
      text: 'Test output text',
    },
    promptIndex: 0,
    rowIndex: 0,
    searchText: '',
    showDiffs: false,
    showStats: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders cell with output text', () => {
    renderWithProviders(<EvalOutputCell {...defaultProps} />);
    expect(screen.getByText('Test output text')).toBeInTheDocument();
  });

  it('displays pass/fail status correctly', () => {
    const { container } = renderWithProviders(<EvalOutputCell {...defaultProps} />);

    const pillElement = screen.getByText('1 FAIL 1 PASS');
    expect(pillElement).toBeInTheDocument();

    const scoreElement = screen.getByText('(0.80)');
    expect(scoreElement).toBeInTheDocument();

    const statusElement = container.querySelector('.status.pass');
    expect(statusElement).toBeInTheDocument();
  });

  it('combines assertion contexts in comment dialog', async () => {
    renderWithProviders(<EvalOutputCell {...defaultProps} />);

    await userEvent.click(screen.getByText('✏️'));

    const dialogContent = screen.getByTestId('context-text');
    expect(dialogContent).toHaveTextContent('Assertion 1 (accuracy): expected value');
    expect(dialogContent).toHaveTextContent('Assertion 2 (relevance): another value');
  });

  it('uses assertion type when metric is not available', async () => {
    const propsWithoutMetrics: MockEvalOutputCellProps = {
      ...defaultProps,
      output: {
        ...defaultProps.output,
        gradingResult: {
          ...defaultProps.output.gradingResult,
          componentResults: [
            {
              assertion: {
                type: 'contains' as AssertionType,
                value: 'expected value',
              },
              pass: true,
              reason: 'Perfect match',
              score: 1.0,
            },
          ],
          pass: true,
          reason: 'Test reason',
          score: 1.0,
        },
      },
    };

    renderWithProviders(<EvalOutputCell {...propsWithoutMetrics} />);

    await userEvent.click(screen.getByText('✏️'));

    const dialogContent = screen.getByTestId('context-text');
    expect(dialogContent).toHaveTextContent('Assertion 1 (contains): expected value');
  });

  it('handles comment updates', async () => {
    renderWithProviders(<EvalOutputCell {...defaultProps} />);

    await userEvent.click(screen.getByText('✏️'));

    const commentInput = screen.getByRole('textbox');
    await userEvent.clear(commentInput);
    await userEvent.type(commentInput, 'New comment');

    await userEvent.click(screen.getByText('Save'));

    expect(mockOnRating).toHaveBeenCalledWith(undefined, undefined, 'New comment');
  });

  it('handles highlight toggle', async () => {
    renderWithProviders(<EvalOutputCell {...defaultProps} />);

    await userEvent.click(screen.getByLabelText('Edit comment'));

    await userEvent.click(screen.getByLabelText('Toggle test highlight'));

    expect(mockOnRating).toHaveBeenCalledWith(undefined, undefined, '!highlight Initial comment');
  });

  it('falls back to output text when no component results', async () => {
    const propsWithoutResults: MockEvalOutputCellProps = {
      ...defaultProps,
      output: {
        ...defaultProps.output,
        gradingResult: {
          ...defaultProps.output.gradingResult,
          componentResults: undefined,
          pass: false,
          reason: '',
          score: 0,
        },
      },
    };

    renderWithProviders(<EvalOutputCell {...propsWithoutResults} />);

    await userEvent.click(screen.getByText('✏️'));

    const dialogContent = screen.getByTestId('context-text');
    expect(dialogContent).toHaveTextContent('Test output text');
  });
});
