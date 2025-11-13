import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import EvalPage from './page';

vi.mock('@app/pages/eval/components/Eval', () => ({
  default: ({ fetchId }: { fetchId?: string | null }) => (
    <div data-testid="mock-eval" data-fetch-id={fetchId === null ? 'null' : fetchId || ''}></div>
  ),
}));

vi.mock('./components/FilterModeProvider', () => {
  const MockFilterModeProvider = ({ children }: { children: React.ReactNode }) => {
    return <div data-testid="mock-filter-mode-provider">{children}</div>;
  };
  return {
    default: MockFilterModeProvider,
  };
});

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

  it('should prioritize evalId from route params when both evalId and filter are present in the URL', () => {
    const routeEvalId = 'eval-from-route-params-789';
    const searchEvalId = 'eval-from-search-params-012';
    const filter = '[{"id":"filter1","type":"pass","value":true}]';

    render(
      <MemoryRouter
        initialEntries={[`/eval/${routeEvalId}?evalId=${searchEvalId}&filter=${filter}`]}
      >
        <Routes>
          <Route path="/eval/:evalId" element={<EvalPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const mockEvalComponent = screen.getByTestId('mock-eval');

    expect(mockEvalComponent).toHaveAttribute('data-fetch-id', routeEvalId);
  });

  it('should render the FilterModeProvider when a filter parameter is present in the URL', () => {
    render(
      <MemoryRouter
        initialEntries={[`/eval?filter=[{"field":"test","type":"metadata","value":"test_value"}]`]}
      >
        <Routes>
          <Route path="/eval" element={<EvalPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const mockFilterModeProvider = screen.getByTestId('mock-filter-mode-provider');
    expect(mockFilterModeProvider).toBeInTheDocument();
  });

  it('should render the Eval component as a child of FilterModeProvider', () => {
    render(
      <MemoryRouter initialEntries={['/eval']}>
        <Routes>
          <Route path="/eval" element={<EvalPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const mockEvalComponent = screen.getByTestId('mock-eval');
    expect(mockEvalComponent).toBeInTheDocument();
  });
});
