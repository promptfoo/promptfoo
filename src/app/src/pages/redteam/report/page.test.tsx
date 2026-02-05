import React from 'react';

import { useUserStore } from '@app/stores/userStore';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReportPage from './page';

vi.mock('@app/stores/userStore', () => ({
  useUserStore: vi.fn(),
}));

vi.mock('./components/Report', () => ({
  default: () => <div>Report Component</div>,
}));

vi.mock('./components/ReportIndex', () => ({
  default: () => <div>ReportIndex Component</div>,
}));

vi.mock('@app/components/PylonChat', () => ({
  default: () => null,
}));

vi.mock('@app/contexts/UserContext', () => ({
  UserProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

/**
 * Helper to render ReportPage with proper routing context.
 * Uses MemoryRouter with initialEntries to set the URL, which is required
 * because the component uses useSearchParams() from react-router-dom.
 */
function renderWithRouter(initialUrl: string) {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <Routes>
        <Route path="/reports" element={<ReportPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ReportPage', () => {
  const mockedUseUserStore = vi.mocked(useUserStore);
  const mockedUseNavigate = vi.mocked(useNavigate);

  beforeEach(() => {
    vi.clearAllMocks();

    mockedUseUserStore.mockReturnValue({
      email: 'test@example.com',
      isLoading: false,
      fetchEmail: vi.fn(),
    });
  });

  it('should render the Report component when evalId is present in the URL search parameters', () => {
    renderWithRouter('/reports?evalId=test-eval-123');

    expect(screen.getByText('Report Component')).toBeInTheDocument();
    expect(screen.queryByText('ReportIndex Component')).toBeNull();
  });

  it('should render ReportIndex component when evalId is not present in URL search parameters', () => {
    renderWithRouter('/reports');

    expect(screen.getByText('ReportIndex Component')).toBeInTheDocument();
    expect(screen.queryByText('Report Component')).not.toBeInTheDocument();
  });

  it('should render ReportIndex component when evalId is an empty string in URL search parameters', () => {
    renderWithRouter('/reports?evalId=');

    expect(screen.getByText('ReportIndex Component')).toBeInTheDocument();
    expect(screen.queryByText('Report Component')).not.toBeInTheDocument();
  });

  it('should redirect to the login page when the user is not logged in and email is null', () => {
    const navigate = vi.fn();
    mockedUseNavigate.mockReturnValue(navigate);

    mockedUseUserStore.mockReturnValue({
      email: null,
      isLoading: false,
      fetchEmail: vi.fn(),
    });

    renderWithRouter('/reports?evalId=test-eval-123');

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(
      `/login?type=report&redirect=${window.location.pathname}${window.location.search}`,
    );
  });

  it('should display loading state and not render Report or ReportIndex components when isLoading is true', () => {
    mockedUseUserStore.mockReturnValue({
      email: null,
      isLoading: true,
      fetchEmail: vi.fn(),
    });

    renderWithRouter('/reports');

    expect(screen.getByText('Waiting for report data')).toBeInTheDocument();
    expect(screen.queryByText('Report Component')).not.toBeInTheDocument();
    expect(screen.queryByText('ReportIndex Component')).not.toBeInTheDocument();
  });

  it('should return null when isLoading is false and email is null', () => {
    mockedUseUserStore.mockReturnValue({
      email: null,
      isLoading: false,
      fetchEmail: vi.fn(),
    });

    const { container } = renderWithRouter('/reports');

    expect(container.firstChild).toBeNull();
  });

  it('should handle malformed evalId values gracefully', () => {
    renderWithRouter('/reports?evalId=malformed-eval-id!');

    expect(screen.getByText('Report Component')).toBeInTheDocument();
    expect(screen.queryByText('ReportIndex Component')).not.toBeInTheDocument();
  });

  it('should transition from ReportIndex to Report when evalId is added to URL', () => {
    // This test verifies the fix for the bug where URL changes didn't trigger re-renders.
    // By using useSearchParams() instead of window.location.search, the component
    // now properly reacts to URL parameter changes.

    // Helper component to trigger search param changes programmatically
    let setSearchParamsFn: ReturnType<typeof useSearchParams>[1];
    function SearchParamsController() {
      const [, setSearchParams] = useSearchParams();
      setSearchParamsFn = setSearchParams;
      return null;
    }

    render(
      <MemoryRouter initialEntries={['/reports']}>
        <Routes>
          <Route
            path="/reports"
            element={
              <>
                <SearchParamsController />
                <ReportPage />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    // Initially shows ReportIndex (no evalId)
    expect(screen.getByText('ReportIndex Component')).toBeInTheDocument();
    expect(screen.queryByText('Report Component')).not.toBeInTheDocument();

    // Update search params to add evalId - this simulates clicking a row in the table
    act(() => {
      setSearchParamsFn({ evalId: 'new-eval-123' });
    });

    // Should now show Report component (useSearchParams reacts to URL change)
    expect(screen.getByText('Report Component')).toBeInTheDocument();
    expect(screen.queryByText('ReportIndex Component')).not.toBeInTheDocument();
  });
});
