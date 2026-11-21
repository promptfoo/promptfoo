import { TooltipProvider } from '@app/components/ui/tooltip';
import { mockCallApiResponse } from '@app/tests/apiMocks';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EvalsTable from './EvalsTable';

vi.mock('@app/utils/api');

describe('EvalsTable search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('searches names and hidden IDs and can select the current evaluation', async () => {
    mockCallApiResponse({
      data: [
        {
          evalId: 'eval-newest',
          createdAt: 2,
          description: null,
          datasetId: null,
          isRedteam: false,
          label: 'eval-newest',
          numTests: 1,
          passRate: 100,
        },
        {
          evalId: 'eval-target',
          createdAt: 1,
          description: 'Persistent Python worker smoke test',
          datasetId: null,
          isRedteam: false,
          label: 'Persistent Python worker smoke test (eval-target)',
          numTests: 1,
          passRate: 100,
        },
      ],
    });

    const onEvalSelected = vi.fn();

    render(
      <TooltipProvider delayDuration={0}>
        <MemoryRouter>
          <EvalsTable
            onEvalSelected={onEvalSelected}
            focusedEvalId="eval-target"
            showUtilityButtons
          />
        </MemoryRouter>
      </TooltipProvider>,
    );

    await screen.findByText('Persistent Python worker smoke test');

    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search evaluations' }),
      'Persistent Python',
    );

    await waitFor(() => {
      expect(screen.getByText('Persistent Python worker smoke test')).toBeInTheDocument();
      expect(screen.queryByText('eval-newest')).not.toBeInTheDocument();
    });

    expect(screen.queryByRole('columnheader', { name: /^ID/ })).not.toBeInTheDocument();
    const search = screen.getByRole('searchbox', { name: 'Search evaluations' });
    await userEvent.clear(search);
    await userEvent.type(search, 'eval-target');
    await waitFor(() => {
      expect(
        screen.getByRole('link', { name: 'Persistent Python worker smoke test' }),
      ).toBeInTheDocument();
      expect(screen.queryByText('eval-newest')).not.toBeInTheDocument();
    });
    await userEvent.click(
      screen.getByRole('link', { name: 'Persistent Python worker smoke test' }),
    );
    expect(onEvalSelected).toHaveBeenCalledExactlyOnceWith('eval-target');
  });
});
