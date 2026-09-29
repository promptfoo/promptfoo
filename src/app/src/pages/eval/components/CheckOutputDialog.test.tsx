import { mockCallApiRoutes } from '@app/tests/apiMocks';
import { callApi } from '@app/utils/api';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CheckOutputDialog from './CheckOutputDialog';

vi.mock('@app/utils/api', () => ({ callApi: vi.fn() }));

describe('CheckOutputDialog', () => {
  const onClose = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    mockCallApiRoutes([
      {
        method: 'POST',
        path: '/eval/eval-1/results/result-2/check',
        response: { pass: true, score: 1, reason: 'Expected text found' },
      },
    ]);
  });
  function show() {
    return render(<CheckOutputDialog evalId="eval-1" resultId="result-2" onClose={onClose} />);
  }

  it('shows a preview and leaves the dialog open', async () => {
    show();
    await userEvent.type(screen.getByLabelText('Text'), 'expected text');
    await userEvent.click(screen.getByRole('button', { name: 'Check output' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Pass · Score: 1');
    expect(screen.getByRole('status')).toHaveTextContent('Expected text found');
    expect(callApi).toHaveBeenCalledWith(
      '/eval/eval-1/results/result-2/check',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ assertion: { type: 'contains', value: 'expected text' } }),
      }),
    );
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Text'), ' changed');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('omits the value for a format check and displays a failed result', async () => {
    mockCallApiRoutes([
      {
        method: 'POST',
        path: '/eval/eval-1/results/result-2/check',
        response: { pass: false, score: 0, reason: 'Invalid JSON' },
      },
    ]);
    show();
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(screen.getByRole('option', { name: 'Is valid JSON' }));
    expect(screen.queryByLabelText('Text')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Check output' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Fail · Score: 0');
    expect(screen.getByRole('status')).toHaveTextContent('Invalid JSON');
    expect(JSON.parse(String(vi.mocked(callApi).mock.calls[0][1]?.body))).toEqual({
      assertion: { type: 'is-json' },
    });
  });

  it('keeps the input when a request fails and allows retry', async () => {
    mockCallApiRoutes([
      {
        method: 'POST',
        path: '/eval/eval-1/results/result-2/check',
        status: 500,
        response: { error: 'Failed to check saved output' },
      },
      {
        method: 'POST',
        path: '/eval/eval-1/results/result-2/check',
        response: { pass: true, score: 1, reason: 'Matched' },
      },
    ]);
    show();
    await userEvent.type(screen.getByLabelText('Text'), 'keep this');
    await userEvent.click(screen.getByRole('button', { name: 'Check output' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to check saved output');
    expect(screen.getByLabelText('Text')).toHaveValue('keep this');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Check output' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Matched');
  });

  it('prevents editing or duplicate checks while a request is pending', async () => {
    let resolve!: (value: { pass: boolean; score: number; reason: string }) => void;
    const pending = new Promise((done) => {
      resolve = done;
    });
    mockCallApiRoutes([
      { method: 'POST', path: '/eval/eval-1/results/result-2/check', response: () => pending },
    ]);
    show();
    await userEvent.type(screen.getByLabelText('Text'), 'text');
    await userEvent.click(screen.getByRole('button', { name: 'Check output' }));
    expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled();
    expect(screen.getByLabelText('Text')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close preview' })).toBeDisabled();
    resolve({ pass: true, score: 1, reason: 'Matched' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check output' })).toBeEnabled());
    expect(callApi).toHaveBeenCalledTimes(1);
  });
});
