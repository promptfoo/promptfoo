import { mockCallApiResponseOnce, resetCallApiMock } from '@app/tests/apiMocks';
import { callApi } from '@app/utils/api';
import { renderWithProviders } from '@app/utils/testutils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ToolsDialog from './ToolsDialog';

vi.mock('@app/utils/api');

const response = {
  data: {
    config: {
      providers: [
        {
          id: 'echo',
          config: {
            tools: [
              {
                type: 'function',
                function: {
                  name: 'lookup',
                  description: 'Look up a fixture',
                  parameters: {
                    type: 'object',
                    properties: { query: { type: 'string' } },
                    required: ['query'],
                  },
                },
              },
            ],
          },
        },
      ],
    },
  },
};

describe('ToolsDialog', () => {
  beforeEach(() => {
    resetCallApiMock();
  });

  it('loads complete schemas on demand and refreshes on reopening', async () => {
    mockCallApiResponseOnce(response);
    const { rerender } = renderWithProviders(
      <ToolsDialog evalId="eval-one" open={false} onClose={vi.fn()} />,
    );
    expect(callApi).not.toHaveBeenCalled();
    rerender(<ToolsDialog evalId="eval-one" open onClose={vi.fn()} />);
    expect(await screen.findByText(/"required"/)).toHaveTextContent('query');
    expect(callApi).toHaveBeenCalledWith(
      '/results/eval-one?includeTraces=false',
      expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }),
    );
    const signal = vi.mocked(callApi).mock.calls[0][1]?.signal;
    rerender(<ToolsDialog evalId="eval-one" open={false} onClose={vi.fn()} />);
    expect(signal?.aborted).toBe(true);
    mockCallApiResponseOnce(response);
    rerender(<ToolsDialog evalId="eval-one" open onClose={vi.fn()} />);
    expect(await screen.findByText(/"required"/)).toHaveTextContent('query');
    expect(callApi).toHaveBeenCalledTimes(2);
  });

  it('allows retrying a failed schema download', async () => {
    vi.mocked(callApi).mockRejectedValueOnce(new Error('fixture offline'));
    mockCallApiResponseOnce(response);
    renderWithProviders(<ToolsDialog evalId="eval-one" open onClose={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load tools');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(/"required"/)).toHaveTextContent('query');
  });
});
