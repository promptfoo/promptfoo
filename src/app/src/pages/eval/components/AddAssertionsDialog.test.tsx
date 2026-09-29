import { callApi } from '@app/utils/api';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AddAssertionsDialog from './AddAssertionsDialog';

vi.mock('@app/utils/api', () => ({ callApi: vi.fn() }));

describe('AddAssertionsDialog', () => {
  const onClose = vi.fn();
  const onApplied = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(callApi).mockImplementation(
      async () => new Response(JSON.stringify({ added: true, pass: true, score: 1 })),
    );
  });
  function show() {
    return render(
      <AddAssertionsDialog
        evalId="eval-1"
        resultId="result-2"
        onClose={onClose}
        onApplied={onApplied}
      />,
    );
  }

  it('adds a check to the selected output and refreshes the table', async () => {
    show();
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'expected text' } });
    await userEvent.click(screen.getByRole('button', { name: 'Add assertion' }));
    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    expect(callApi).toHaveBeenCalledWith(
      '/eval/eval-1/results/result-2/assertions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ assertion: { type: 'contains', value: 'expected text' } }),
      }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('omits the value for a format check', async () => {
    show();
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(screen.getByRole('option', { name: 'Is valid JSON' }));
    expect(screen.queryByLabelText('Text')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add assertion' }));
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    expect(JSON.parse(String(vi.mocked(callApi).mock.calls[0][1]?.body))).toEqual({
      assertion: { type: 'is-json' },
    });
  });

  it('shows an error and permits a retry without losing the input', async () => {
    vi.mocked(callApi).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'An update is already running for this evaluation' }), {
        status: 409,
      }),
    );
    show();
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'keep this' } });
    await userEvent.click(screen.getByRole('button', { name: 'Add assertion' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('An update is already running');
    expect(screen.getByLabelText('Text')).toHaveValue('keep this');
    expect(onApplied).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Add assertion' }));
    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
  });

  it('prevents duplicate submissions while a request is pending', async () => {
    let resolve!: (response: Response) => void;
    vi.mocked(callApi).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    show();
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'text' } });
    await userEvent.click(screen.getByRole('button', { name: 'Add assertion' }));
    expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByLabelText('Text')).toBeDisabled();
    resolve(new Response(JSON.stringify({ added: false, pass: true, score: 1 })));
    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    expect(callApi).toHaveBeenCalledTimes(1);
  });
});
