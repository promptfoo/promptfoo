import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import EvalPage from './page';

vi.mock('@app/pages/eval/components/Eval', () => ({
  default: ({ fetchId }: { fetchId?: string | null }) => (
    <div data-testid="mock-eval" data-fetch-id={fetchId === null ? 'null' : fetchId || ''}></div>
  ),
}));

describe('EvalPage', () => {
  it('should pass the evalId from useParams as fetchId to the Eval component when evalId is present', () => {
    const routeEvalId = 'eval-from-route-params-123';

    render(
      <MemoryRouter initialEntries={[`/eval/${routeEvalId}`]}>
        <Routes>
          <Route path="/eval/:evalId" element={<EvalPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const mockEvalComponent = screen.getByTestId('mock-eval');

    expect(mockEvalComponent).toHaveAttribute('data-fetch-id', routeEvalId);
  });

  it('should pass the evalId containing special characters from useParams as fetchId to the Eval component', () => {
    const routeEvalId = 'eval-with-special-chars/ %$#@!';
    const encodedEvalId = encodeURIComponent(routeEvalId);

    render(
      <MemoryRouter initialEntries={[`/eval/${encodedEvalId}`]}>
        <Routes>
          <Route path="/eval/:evalId" element={<EvalPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const mockEvalComponent = screen.getByTestId('mock-eval');

    expect(mockEvalComponent).toHaveAttribute('data-fetch-id', routeEvalId);
  });

  it('should pass the evalId from useSearchParams as fetchId to the Eval component when evalId is not present in the route params but is present in the search params', () => {
    const searchEvalId = 'eval-from-search-params-456';

    render(
      <MemoryRouter initialEntries={[`/eval?evalId=${searchEvalId}`]}>
        <Routes>
          <Route path="/eval" element={<EvalPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const mockEvalComponent = screen.getByTestId('mock-eval');

    expect(mockEvalComponent).toHaveAttribute('data-fetch-id', searchEvalId);
  });

  it('should pass null as fetchId to the Eval component when neither useParams nor useSearchParams provide an evalId', () => {
    render(
      <MemoryRouter initialEntries={['/eval']}>
        <Routes>
          <Route path="/eval" element={<EvalPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const mockEvalComponent = screen.getByTestId('mock-eval');

    expect(mockEvalComponent).toHaveAttribute('data-fetch-id', 'null');
  });
});
