import { TooltipProvider } from '@app/components/ui/tooltip';
import { EVAL_ROUTES } from '@app/constants/routes';
import { mockCallApiResponse } from '@app/tests/apiMocks';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EvalsTable from './EvalsTable';

vi.mock('@app/utils/api');

function EvaluationRoutes() {
  const navigate = useNavigate();

  return (
    <Routes>
      <Route
        path={EVAL_ROUTES.LIST}
        element={
          <>
            <h1>Evaluation list</h1>
            <EvalsTable
              showUtilityButtons
              onEvalSelected={(evalId) => navigate(EVAL_ROUTES.DETAIL(evalId))}
            />
          </>
        }
      />
      <Route
        path={EVAL_ROUTES.DETAIL(':evalId')}
        element={
          <>
            <h1>Evaluation detail</h1>
            <button onClick={() => navigate(-1)}>Back</button>
          </>
        }
      />
    </Routes>
  );
}

async function showIdColumn(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Columns' }));
  await user.click(await screen.findByRole('menuitemcheckbox', { name: 'ID' }));
  await user.keyboard('{Escape}');
}

describe('EvalsTable navigation', () => {
  beforeEach(() => {
    mockCallApiResponse({
      data: [
        {
          evalId: 'eval-1',
          createdAt: 1,
          description: 'Example evaluation',
          datasetId: null,
          isRedteam: false,
          label: 'eval-1',
          numTests: 1,
          passRate: 100,
        },
      ],
    });
  });

  it.each(['click', 'Enter'])('selects an eval only once on ID link %s', async (activation) => {
    const user = userEvent.setup();
    const onEvalSelected = vi.fn();

    render(
      <TooltipProvider>
        <MemoryRouter>
          <EvalsTable showUtilityButtons onEvalSelected={onEvalSelected} />
        </MemoryRouter>
      </TooltipProvider>,
    );

    await showIdColumn(user);
    const link = await screen.findByRole('link', { name: 'eval-1' });
    if (activation === 'click') {
      await user.click(link);
    } else {
      link.focus();
      await user.keyboard('{Enter}');
    }

    expect(onEvalSelected).toHaveBeenCalledExactlyOnceWith('eval-1');
  });

  it.each(['ID link', 'description link'])(
    'returns to the list with one Back after clicking the %s',
    async (target) => {
      const user = userEvent.setup();

      render(
        <TooltipProvider>
          <MemoryRouter initialEntries={[EVAL_ROUTES.LIST]}>
            <EvaluationRoutes />
          </MemoryRouter>
        </TooltipProvider>,
      );

      if (target === 'ID link') {
        await showIdColumn(user);
        await user.click(await screen.findByRole('link', { name: 'eval-1' }));
      } else {
        await user.click(await screen.findByRole('link', { name: 'Example evaluation' }));
      }
      expect(screen.getByRole('heading', { name: 'Evaluation detail' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Back' }));

      expect(await screen.findByRole('heading', { name: 'Evaluation list' })).toBeInTheDocument();
    },
  );
});
