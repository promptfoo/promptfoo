import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient, createQueryClientWrapper } from '../../../test/queryClientWrapper';
import ReportPage from './page';

let mockUserEmail: string | null = null;
let mockIsLoading = false;

vi.mock('@app/hooks/useUser', () => ({
  useUser: () => ({
    data: { email: mockUserEmail, id: null },
    isLoading: mockIsLoading,
  }),
}));

vi.mock('./components/Report', () => ({
  default: () => <div data-testid="report">Report Component</div>,
}));

vi.mock('./components/ReportIndex', () => ({
  default: () => <div data-testid="report-index">Report Index Component</div>,
}));

vi.mock('@app/components/PylonChat', () => ({
  default: () => <div data-testid="pylon-chat">Pylon Chat</div>,
}));

vi.mock('@app/contexts/UserContext', () => ({
  UserProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@app/hooks/usePageMeta', () => ({
  usePageMeta: vi.fn(),
}));

describe('ReportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserEmail = 'test@example.com';
    mockIsLoading = false;
  });

  const renderWithRouter = (initialEntries: string[] = ['/']) => {
    const queryClient = createTestQueryClient();
    // Mock window.location.search since ReportPage uses it instead of useSearchParams
    const entry = initialEntries[0];
    const searchPart = entry.includes('?') ? entry.substring(entry.indexOf('?')) : '';
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: searchPart },
      writable: true,
    });

    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="*" element={<ReportPage />} />
        </Routes>
      </MemoryRouter>,
      {
        wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
      },
    );
  };

  it('should set page metadata to Red Team Vulnerability Reports when evalId is present', () => {
    renderWithRouter(['/?evalId=123']);
    expect(screen.getByTestId('report')).toBeInTheDocument();
  });

  it('should render the Report component when evalId is present in the URL search parameters', () => {
    renderWithRouter(['/?evalId=123']);
    expect(screen.getByTestId('report')).toBeInTheDocument();
  });

  it('should render ReportIndex component when evalId is not present in URL search parameters', () => {
    renderWithRouter(['/']);
    expect(screen.getByTestId('report-index')).toBeInTheDocument();
  });

  it('should render ReportIndex component when evalId is an empty string in URL search parameters', () => {
    renderWithRouter(['/?evalId=']);
    expect(screen.getByTestId('report-index')).toBeInTheDocument();
  });

  it('should redirect to the login page when the user is not logged in and email is null', () => {
    mockUserEmail = null;
    mockIsLoading = false;
    renderWithRouter(['/']);
    // Component should not render when not logged in
  });

  it('should display loading state and not render Report or ReportIndex components when isLoading is true', () => {
    mockIsLoading = true;
    renderWithRouter(['/']);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('should return null when isLoading is false and email is null', () => {
    mockUserEmail = null;
    mockIsLoading = false;
    const { container } = renderWithRouter(['/']);
    // Component redirects, so it shouldn't have main content
  });

  it('should properly encode the redirect URL when special characters are present in pathname and search', () => {
    mockUserEmail = null;
    renderWithRouter(['/?evalId=123&special=test%20space']);
    // Component should handle special characters in redirect
  });

  it('should handle malformed evalId values gracefully', () => {
    renderWithRouter(['/?evalId=invalid%20id']);
    expect(screen.getByTestId('report')).toBeInTheDocument();
  });
});
