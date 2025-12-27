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

// Mock useActionState
let mockActionState: any = { success: false };
let mockFormAction: any = vi.fn();
let mockIsPending = false;

vi.mock('react', async () => {
  const actual = await vi.importActual('react');
  return {
    ...actual,
    useActionState: vi.fn(() => [mockActionState, mockFormAction, mockIsPending]),
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

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocationSearch = '';
    mockActionState = { success: false };
    mockIsPending = false;
    mockFormAction = vi.fn(async (formData: FormData) => {
      // Simulate the actual loginAction behavior
      const apiKey = formData.get('apiKey') as string;
      const customUrl = formData.get('customUrl') as string;

      if (!apiKey?.trim()) {
        mockActionState = { success: false, error: 'Please enter your API key' };
        return mockActionState;
      }

      try {
        const response = await callApiMock('/user/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            apiKey: apiKey.trim(),
            apiHost: customUrl || undefined,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          mockActionState = { success: true, email: data.user.email };
          return mockActionState;
        }

        const errorData = await response.json().catch(() => ({}));
        mockActionState = {
          success: false,
          error: errorData.error || 'Authentication failed. Please check your API key.',
        };
        return mockActionState;
      } catch {
        mockActionState = {
          success: false,
          error: 'Network error. Please check your connection and try again.',
        };
        return mockActionState;
      }
    });
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

    const { rerender } = render(
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

    // Simulate the state update from useActionState
    mockActionState = { success: true, email: 'test@example.com' };
    rerender(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(setEmail).toHaveBeenCalledWith('test@example.com'));
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

  it('should redirect to the default route when the redirect query parameter is empty and the user is logged in', () => {
    useUserStoreMock.mockReturnValue({
      email: 'test@example.com',
      isLoading: false,
      fetchEmail: vi.fn(),
      setEmail: vi.fn(),
    });

    mockLocationSearch = '?redirect=';

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('should navigate to the provided route when the redirect parameter points to a non-existent route', () => {
    useUserStoreMock.mockReturnValue({
      email: 'test@example.com',
      isLoading: false,
      fetchEmail: vi.fn(),
      setEmail: vi.fn(),
    });

    mockLocationSearch = '?redirect=/non-existent-route';

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(mockNavigate).toHaveBeenCalledWith('/non-existent-route');
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

    const { rerender } = render(
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

    // Simulate the state update from useActionState
    mockActionState = { success: false, error: 'Invalid API key or authentication failed' };
    rerender(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    // Check that error is displayed in UI instead of console
    await waitFor(() => {
      expect(screen.getByText('Invalid API key or authentication failed')).toBeInTheDocument();
    });
  });

  it('should use the latest redirect parameter if it changes after component mount but before login', async () => {
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

    mockLocationSearch = '?redirect=/initial-redirect';

    const { rerender } = render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    const apiKeyField = document.getElementById('apiKey')!;
    fireEvent.change(apiKeyField, {
      target: { value: 'test-api-key' },
    });

    mockLocationSearch = '?redirect=/updated-redirect';

    fireEvent.click(screen.getByText('Sign In'));

    await waitFor(() => expect(callApiMock).toHaveBeenCalledTimes(1));

    expect(callApiMock).toHaveBeenCalledWith('/user/login', expect.any(Object));

    // Simulate the state update from useActionState
    mockActionState = { success: true, email: 'test@example.com' };
    rerender(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(setEmail).toHaveBeenCalledWith('test@example.com'));
    // The current implementation correctly reads the search params fresh each time
    expect(mockNavigate).toHaveBeenCalledWith('/updated-redirect');
  });

  it('should navigate to default route when redirect URL is malformed', () => {
    useUserStoreMock.mockReturnValue({
      email: 'test@example.com',
      isLoading: false,
      fetchEmail: vi.fn(),
      setEmail: vi.fn(),
    });

    mockLocationSearch = '?redirect=javascript:alert("XSS")';

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('should handle redirect URLs with query parameters', () => {
    useUserStoreMock.mockReturnValue({
      email: 'test@example.com',
      isLoading: false,
      fetchEmail: vi.fn(),
      setEmail: vi.fn(),
    });

    mockLocationSearch = '?redirect=/some-page?param1=value1&param2=value2';

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(mockNavigate).toHaveBeenCalledWith('/some-page?param1=value1&param2=value2');
  });
});
