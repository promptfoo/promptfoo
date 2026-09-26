import { TooltipProvider } from '@app/components/ui/tooltip';
import { mockCallApiResponse, resetCallApiMock } from '@app/tests/apiMocks';
import { callApi } from '@app/utils/api';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FailureSummary } from './FailureSummary';

const addFilter = vi.fn();
const removeFilter = vi.fn();
let filterValues: Record<string, unknown> = {};

vi.mock('@app/utils/api', () => ({ callApi: vi.fn() }));
vi.mock('./store', () => ({
  useTableStore: () => ({
    addFilter,
    filters: { values: filterValues },
    removeFilter,
  }),
}));

describe('FailureSummary', () => {
  beforeEach(() => {
    addFilter.mockReset();
    removeFilter.mockReset();
    filterValues = {};
    resetCallApiMock();
  });

  it('groups failures and adds an exact error filter when selected', async () => {
    mockCallApiResponse({ failures: [{ error: 'Request timed out', count: 2 }] });

    render(
      <TooltipProvider>
        <FailureSummary evalId="eval-123" />
      </TooltipProvider>,
    );

    const failureGroup = await screen.findByRole('button', { name: '2 failures' });
    await userEvent.click(failureGroup);

    expect(callApi).toHaveBeenCalledWith(
      '/eval/eval-123/failure-summary',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(addFilter).toHaveBeenCalledWith({
      type: 'error',
      operator: 'equals',
      value: 'Request timed out',
    });
  });

  it('removes the filter when the selected error group is already active', async () => {
    filterValues = {
      existing: {
        type: 'error',
        operator: 'equals',
        value: 'Request timed out',
      },
    };
    mockCallApiResponse({ failures: [{ error: 'Request timed out', count: 1 }] });

    render(
      <TooltipProvider>
        <FailureSummary evalId="eval-123" />
      </TooltipProvider>,
    );

    await userEvent.click(await screen.findByRole('button', { name: '1 failure' }));

    expect(removeFilter).toHaveBeenCalledWith('existing');
  });

  it('does not render a group for an invalid summary response', async () => {
    mockCallApiResponse({});

    render(
      <TooltipProvider>
        <FailureSummary evalId="eval-123" />
      </TooltipProvider>,
    );

    await waitFor(() => {
      expect(callApi).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText('Failure groups:')).not.toBeInTheDocument();
  });
});
