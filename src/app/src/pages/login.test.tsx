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
      title: 'Login to Promptfoo',
      description: 'Sign in to access your Promptfoo workspace',
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

  it('submits API key and redirects on success', async () => {
    const setEmail = vi.fn();
    useUserStoreMock.mockReturnValue({
      email: null,
      isLoading: false,
      fetchEmail: vi.fn(),
      setEmail,
    });

    callApiMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        user: { email: 'test@example.com' },
      }),
    });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    const apiKeyField = document.getElementById('apiKey')!;
    fireEvent.change(apiKeyField, {
      target: { value: 'test-api-key' },
    });
    fireEvent.click(screen.getByText('Sign In'));

    await waitFor(() => expect(callApiMock).toHaveBeenCalledTimes(1));

    expect(callApiMock).toHaveBeenCalledWith('/user/login', expect.any(Object));
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

    callApiMock.mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'API Error' }),
    });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    const apiKeyField = document.getElementById('apiKey')!;
    fireEvent.change(apiKeyField, {
      target: { value: 'test-api-key' },
    });
    fireEvent.click(screen.getByText('Sign In'));

    await waitFor(() => expect(callApiMock).toHaveBeenCalledTimes(1));

    expect(callApiMock).toHaveBeenCalledWith('/user/login', expect.any(Object));
    expect(setEmail).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
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

  it('shows and hides API key using visibility toggle', () => {
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

    const apiKeyField = document.getElementById('apiKey')!;
    const toggleButton = screen.getByLabelText(/toggle API key visibility/i);

    // Initially should be password type
    expect(apiKeyField).toHaveAttribute('type', 'password');

    // Click to show
    fireEvent.click(toggleButton);
    expect(apiKeyField).toHaveAttribute('type', 'text');

    // Click to hide
    fireEvent.click(toggleButton);
    expect(apiKeyField).toHaveAttribute('type', 'password');
  });

  it('validates API key length', async () => {
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

    const longApiKey = 'a'.repeat(600); // Over 512 char limit
    const apiKeyField = document.getElementById('apiKey')!;
    fireEvent.change(apiKeyField, {
      target: { value: longApiKey },
    });
    fireEvent.click(screen.getByText('Sign In'));

    // Should still attempt the call (validation happens on backend)
    await waitFor(() => expect(callApiMock).toHaveBeenCalledTimes(1));
  });

  it('handles authentication error with sanitized message', async () => {
    const setEmail = vi.fn();
    useUserStoreMock.mockReturnValue({
      email: null,
      isLoading: false,
      fetchEmail: vi.fn(),
      setEmail,
    });

    callApiMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: vi.fn().mockResolvedValue({ error: 'Invalid API key or authentication failed' }),
    });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    const apiKeyField = document.getElementById('apiKey')!;
    fireEvent.change(apiKeyField, {
      target: { value: 'invalid-key' },
    });
    fireEvent.click(screen.getByText('Sign In'));

    await waitFor(() => expect(callApiMock).toHaveBeenCalledTimes(1));

    // Check that error is displayed in UI instead of console
    await waitFor(() => {
      expect(screen.getByText('Invalid API key or authentication failed')).toBeInTheDocument();
    });
  });
});
