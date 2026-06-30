import { TooltipProvider } from '@app/components/ui/tooltip';
import { callApiJson } from '@app/utils/api';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EvalsTable from './EvalsTable';

vi.mock('@app/utils/api');

describe('EvalsTable search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('searches displayed descriptions when the first row has no description', async () => {
    vi.mocked(callApiJson).mockResolvedValue({
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
    } as any);

    render(
      <TooltipProvider delayDuration={0}>
        <MemoryRouter>
          <EvalsTable onEvalSelected={vi.fn()} showUtilityButtons />
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
  });
});
