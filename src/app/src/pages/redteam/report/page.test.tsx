import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { usePageMeta } from '@app/hooks/usePageMeta';
import { useUserStore } from '@app/stores/userStore';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ReportPage from './page';

vi.mock('@app/hooks/usePageMeta', () => ({
  usePageMeta: vi.fn(),
}));

vi.mock('@app/stores/userStore', () => ({
  useUserStore: vi.fn(),
}));

vi.mock('./components/Report', () => ({
  default: () => <div>Report Component</div>,
}));

vi.mock('./components/ReportIndex', () => ({
  default: () => <div>ReportIndex Component</div>,
}));

vi.mock('@app/components/CrispChat', () => ({
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

describe('ReportPage', () => {
  const mockedUseUserStore = vi.mocked(useUserStore);
  const mockedUsePageMeta = vi.mocked(usePageMeta);
  const mockedUseNavigate = vi.mocked(useNavigate);
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });

    mockedUseUserStore.mockReturnValue({
      email: 'test@example.com',
      isLoading: false,
      fetchEmail: vi.fn(),
    });
  });

  it("should set page metadata to 'Red team report' when evalId is present", () => {
    const url = 'http://localhost/report?evalId=test-eval-123';
    Object.defineProperty(window, 'location', {
      writable: true,
      value: new URL(url),
    });

    render(
      <MemoryRouter>
        <ReportPage />
      </MemoryRouter>,
    );

    expect(mockedUsePageMeta).toHaveBeenCalledTimes(1);
    expect(mockedUsePageMeta).toHaveBeenCalledWith({
      title: 'Red team report',
      description: 'View or browse red team results',
    });

    expect(screen.getByText('Report Component')).toBeInTheDocument();
    expect(screen.queryByText('ReportIndex Component')).not.toBeInTheDocument();
  });

  it('should render the Report component when evalId is present in the URL search parameters', () => {
    const url = 'http://localhost/report?evalId=test-eval-123';
    Object.defineProperty(window, 'location', {
      writable: true,
      value: new URL(url),
    });

    render(
      <MemoryRouter>
        <ReportPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Report Component')).toBeInTheDocument();
    expect(screen.queryByText('ReportIndex Component')).toBeNull();
  });

  it('should render ReportIndex component when evalId is not present in URL search parameters', () => {
    const url = 'http://localhost/report';
    Object.defineProperty(window, 'location', {
      writable: true,
      value: new URL(url),
    });

    render(
      <MemoryRouter>
        <ReportPage />
      </MemoryRouter>,
    );

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

    const url = 'http://localhost/report?evalId=test-eval-123';
    Object.defineProperty(window, 'location', {
      writable: true,
      value: new URL(url),
    });

    render(
      <MemoryRouter>
        <ReportPage />
      </MemoryRouter>,
    );

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

    render(
      <MemoryRouter>
        <ReportPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('Report Component')).not.toBeInTheDocument();
    expect(screen.queryByText('ReportIndex Component')).not.toBeInTheDocument();
  });

  it('should return null when isLoading is false and email is null', () => {
    mockedUseUserStore.mockReturnValue({
      email: null,
      isLoading: false,
      fetchEmail: vi.fn(),
    });

    const { container } = render(
      <MemoryRouter>
        <ReportPage />
      </MemoryRouter>,
    );

    expect(container.firstChild).toBeNull();
  });
});
