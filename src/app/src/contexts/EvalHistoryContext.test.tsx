import { useContext } from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EvalHistoryProvider } from './EvalHistoryContext';
import { EvalHistoryContext } from './EvalHistoryContextDef';

describe('EvalHistoryContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const TestConsumer = () => {
    const context = useContext(EvalHistoryContext);

    if (!context) {
      throw new Error('TestConsumer must be used within an EvalHistoryProvider');
    }

    const { lastEvalCompletedAt, signalEvalCompleted } = context;

    return (
      <div>
        <p data-testid="last-eval-completed">
          {lastEvalCompletedAt ? lastEvalCompletedAt.toString() : 'null'}
        </p>
        <button type="button" onClick={signalEvalCompleted}>
          Signal Eval Completed
        </button>
      </div>
    );
  };

  it('should provide null lastEvalCompletedAt initially', () => {
    render(
      <EvalHistoryProvider>
        <TestConsumer />
      </EvalHistoryProvider>,
    );

    expect(screen.getByTestId('last-eval-completed')).toHaveTextContent('null');
  });

  it('should update lastEvalCompletedAt when signalEvalCompleted is called', async () => {
    const user = userEvent.setup();

    render(
      <EvalHistoryProvider>
        <TestConsumer />
      </EvalHistoryProvider>,
    );

    expect(screen.getByTestId('last-eval-completed')).toHaveTextContent('null');

    await user.click(screen.getByRole('button', { name: 'Signal Eval Completed' }));

    await waitFor(() => {
      expect(screen.getByTestId('last-eval-completed')).not.toHaveTextContent('null');
    });

    const timestamp = Number(screen.getByTestId('last-eval-completed').textContent);
    expect(timestamp).toBeGreaterThan(0);
    expect(timestamp).toBeLessThanOrEqual(Date.now());
  });

  it('should update lastEvalCompletedAt with a new timestamp on subsequent calls', async () => {
    const user = userEvent.setup();

    render(
      <EvalHistoryProvider>
        <TestConsumer />
      </EvalHistoryProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Signal Eval Completed' }));

    await waitFor(() => {
      expect(screen.getByTestId('last-eval-completed')).not.toHaveTextContent('null');
    });

    const firstTimestamp = Number(screen.getByTestId('last-eval-completed').textContent);

    // Wait a bit to ensure different timestamp
    await new Promise((resolve) => setTimeout(resolve, 10));

    await user.click(screen.getByRole('button', { name: 'Signal Eval Completed' }));

    await waitFor(() => {
      const secondTimestamp = Number(screen.getByTestId('last-eval-completed').textContent);
      expect(secondTimestamp).toBeGreaterThan(firstTimestamp);
    });
  });

  it('should trigger re-render in consuming components when signalEvalCompleted is called', async () => {
    const user = userEvent.setup();
    const renderCount = { current: 0 };

    const RenderCountingConsumer = () => {
      const context = useContext(EvalHistoryContext);
      renderCount.current += 1;

      if (!context) {
        throw new Error('Must be used within EvalHistoryProvider');
      }

      return (
        <div>
          <p data-testid="render-count">{renderCount.current}</p>
          <button type="button" onClick={context.signalEvalCompleted}>
            Signal
          </button>
        </div>
      );
    };

    render(
      <EvalHistoryProvider>
        <RenderCountingConsumer />
      </EvalHistoryProvider>,
    );

    const initialRenderCount = renderCount.current;

    await user.click(screen.getByRole('button', { name: 'Signal' }));

    await waitFor(() => {
      expect(renderCount.current).toBeGreaterThan(initialRenderCount);
    });
  });

  it('should allow multiple consumers to receive updates', async () => {
    const user = userEvent.setup();

    const Consumer1 = () => {
      const context = useContext(EvalHistoryContext);
      return <p data-testid="consumer-1">{context?.lastEvalCompletedAt?.toString() ?? 'null'}</p>;
    };

    const Consumer2 = () => {
      const context = useContext(EvalHistoryContext);
      return (
        <div>
          <p data-testid="consumer-2">{context?.lastEvalCompletedAt?.toString() ?? 'null'}</p>
          <button type="button" onClick={context?.signalEvalCompleted}>
            Signal
          </button>
        </div>
      );
    };

    render(
      <EvalHistoryProvider>
        <Consumer1 />
        <Consumer2 />
      </EvalHistoryProvider>,
    );

    expect(screen.getByTestId('consumer-1')).toHaveTextContent('null');
    expect(screen.getByTestId('consumer-2')).toHaveTextContent('null');

    await user.click(screen.getByRole('button', { name: 'Signal' }));

    await waitFor(() => {
      expect(screen.getByTestId('consumer-1')).not.toHaveTextContent('null');
      expect(screen.getByTestId('consumer-2')).not.toHaveTextContent('null');
    });

    // Both consumers should have the same timestamp
    expect(screen.getByTestId('consumer-1').textContent).toBe(
      screen.getByTestId('consumer-2').textContent,
    );
  });
});
