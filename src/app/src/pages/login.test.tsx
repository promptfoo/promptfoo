import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './login';

const mockNavigate = vi.fn();
let mockLocationSearch = '';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ search: mockLocationSearch }),
  };
});

const useUserStoreMock = vi.fn();
vi.mock('@app/stores/userStore', () => ({
  useUserStore: (...args: any[]) => useUserStoreMock(...args),
}));

const callApiMock = vi.fn();
vi.mock('@app/utils/api', () => ({
  callApi: (...args: any[]) => callApiMock(...args),
}));

const usePageMetaMock = vi.fn();
vi.mock('@app/hooks/usePageMeta', () => ({
  usePageMeta: (...args: any[]) => usePageMetaMock(...args),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocationSearch = '';
  });

  it('should call fetchEmail from useUserStore when component is mounted', () => {
    const fetchEmailMock = vi.fn();
    useUserStoreMock.mockReturnValue({
      email: null,
      isLoading: false,
      fetchEmail: fetchEmailMock,
      setEmail: vi.fn(),
    });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(fetchEmailMock).toHaveBeenCalledTimes(1);
  });

  it('should call usePageMeta with correct parameters', () => {
    useUserStoreMock.mockReturnValue({
      email: null,
      isLoading: false,
      fetchEmail: vi.fn(),
      setEmail: vi.fn(),
    });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(usePageMetaMock).toHaveBeenCalledWith({
      title: 'Login',
      description: 'Authenticate to access promptfoo',
    });
  });

  it('shows loading spinner when loading', () => {
    useUserStoreMock.mockReturnValue({
      email: null,
      isLoading: true,
      fetchEmail: vi.fn(),
      setEmail: vi.fn(),
    });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('submits email and redirects on success', async () => {
    const setEmail = vi.fn();
    useUserStoreMock.mockReturnValue({
      email: null,
      isLoading: false,
      fetchEmail: vi.fn(),
      setEmail,
    });

    callApiMock.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}) });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(screen.getByText('Login'));

    await waitFor(() => expect(callApiMock).toHaveBeenCalledTimes(2));

    expect(callApiMock).toHaveBeenCalledWith('/user/email', expect.any(Object));
    expect(setEmail).toHaveBeenCalledWith('test@example.com');
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('handles API failure on submit', async () => {
    const setEmail = vi.fn();
    useUserStoreMock.mockReturnValue({
      email: null,
      isLoading: false,
      fetchEmail: vi.fn(),
      setEmail,
    });

    callApiMock.mockResolvedValue({ ok: false });
    const consoleErrorSpy = vi.spyOn(console, 'error');

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(screen.getByText('Login'));

    await waitFor(() => expect(callApiMock).toHaveBeenCalledTimes(1));

    expect(callApiMock).toHaveBeenCalledWith('/user/email', expect.any(Object));
    expect(setEmail).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to set email');
  });

  it('should redirect to the URL specified in the redirect query parameter if the user is logged in', () => {
    useUserStoreMock.mockReturnValue({
      email: 'test@example.com',
      isLoading: false,
      fetchEmail: vi.fn(),
      setEmail: vi.fn(),
    });

    mockLocationSearch = '?redirect=/test-redirect';

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(mockNavigate).toHaveBeenCalledWith('/test-redirect');
  });

  it('displays "View Report" when the URL contains "?type=report"', () => {
    useUserStoreMock.mockReturnValue({
      email: null,
      isLoading: false,
      fetchEmail: vi.fn(),
      setEmail: vi.fn(),
    });

    mockLocationSearch = '?type=report';

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('View Report')).toBeInTheDocument();
  });
});
