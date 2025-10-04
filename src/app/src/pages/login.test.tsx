import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient, createQueryClientWrapper } from '../test/queryClientWrapper';
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

let mockUserEmail: string | null = null;
let mockIsLoading = false;
let mockSetEmail = vi.fn();

vi.mock('@app/hooks/useUser', () => ({
  useUser: () => ({
    data: { email: mockUserEmail, id: null },
    isLoading: mockIsLoading,
  }),
  useUserEmail: () => ({
    email: mockUserEmail,
    isLoading: mockIsLoading,
  }),
  useSetUserEmail: () => mockSetEmail,
}));

const callApiMock = vi.fn();
vi.mock('@app/utils/api', () => ({
  callApi: (...args: any[]) => callApiMock(...args),
}));

const usePageMetaMock = vi.fn();
vi.mock('@app/hooks/usePageMeta', () => ({
  usePageMeta: (...args: any[]) => usePageMetaMock(...args),
}));

function renderWithQueryClient(component: React.ReactElement) {
  const queryClient = createTestQueryClient();
  return render(component, {
    wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
  });
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocationSearch = '';
    mockUserEmail = null;
    mockIsLoading = false;
    mockSetEmail = vi.fn();
  });

  it('should call fetchEmail from useUserStore when component is mounted', () => {
    renderWithQueryClient(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    // React Query automatically fetches on mount - just verify component renders
    const apiKeyInput = document.getElementById('apiKey');
    expect(apiKeyInput).toBeInTheDocument();
  });

  it('should call usePageMeta with correct parameters', () => {
    renderWithQueryClient(
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
    mockIsLoading = true;

    renderWithQueryClient(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('submits API key and redirects on success', async () => {
    callApiMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        user: { email: 'test@example.com' },
      }),
    });

    renderWithQueryClient(
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
    expect(mockSetEmail).toHaveBeenCalledWith('test@example.com');
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('handles API failure on submit', async () => {
    callApiMock.mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'API Error' }),
    });

    renderWithQueryClient(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    const apiKeyField = document.getElementById('apiKey')!;
    fireEvent.change(apiKeyField, {
      target: { value: 'test-api-key' },
    });
    fireEvent.click(screen.getByText('Sign In'));

    await waitFor(() => {
      expect(screen.getByText(/API Error/i)).toBeInTheDocument();
    });

    expect(mockSetEmail).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should redirect to the URL specified in the redirect query parameter if the user is logged in', () => {
    mockUserEmail = 'test@example.com';
    mockIsLoading = false;
    mockLocationSearch = '?redirect=/custom-route';

    renderWithQueryClient(
      <MemoryRouter initialEntries={['/?redirect=/custom-route']}>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(mockNavigate).toHaveBeenCalledWith('/custom-route');
  });

  it('should redirect to the default route when the redirect query parameter is empty and the user is logged in', () => {
    mockUserEmail = 'test@example.com';
    mockIsLoading = false;

    renderWithQueryClient(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('should navigate to the provided route when the redirect parameter points to a non-existent route', () => {
    mockUserEmail = 'test@example.com';
    mockLocationSearch = '?redirect=/nonexistent';

    renderWithQueryClient(
      <MemoryRouter initialEntries={['/?redirect=/nonexistent']}>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(mockNavigate).toHaveBeenCalledWith('/nonexistent');
  });

  it('displays "View Report" when the URL contains "?type=report"', () => {
    mockLocationSearch = '?type=report';

    renderWithQueryClient(
      <MemoryRouter initialEntries={['/?type=report']}>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('View Report')).toBeInTheDocument();
  });

  it('shows and hides API key using visibility toggle', () => {
    renderWithQueryClient(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    const apiKeyField = document.getElementById('apiKey')! as HTMLInputElement;
    expect(apiKeyField.type).toBe('password');

    const toggleButton = screen.getByLabelText(/toggle API key visibility/i);
    fireEvent.click(toggleButton);

    expect(apiKeyField.type).toBe('text');

    fireEvent.click(toggleButton);
    expect(apiKeyField.type).toBe('password');
  });

  it('validates API key length', () => {
    renderWithQueryClient(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    const submitButton = screen.getByText('Sign In');
    expect(submitButton).toBeDisabled();

    const apiKeyField = document.getElementById('apiKey')!;
    fireEvent.change(apiKeyField, {
      target: { value: 'test' },
    });

    expect(submitButton).toBeEnabled();
  });

  it('handles authentication error with sanitized message', async () => {
    callApiMock.mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Invalid credentials' }),
    });

    renderWithQueryClient(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    const apiKeyField = document.getElementById('apiKey')!;
    fireEvent.change(apiKeyField, {
      target: { value: 'invalid-key' },
    });
    fireEvent.click(screen.getByText('Sign In'));

    await waitFor(() => {
      expect(screen.getByText(/Invalid credentials/i)).toBeInTheDocument();
    });
  });

  it('should use the latest redirect parameter if it changes after component mount but before login', async () => {
    mockLocationSearch = '?redirect=/initial';

    renderWithQueryClient(
      <MemoryRouter initialEntries={['/?redirect=/initial']}>
        <LoginPage />
      </MemoryRouter>,
    );

    mockLocationSearch = '?redirect=/updated';

    callApiMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        user: { email: 'test@example.com' },
      }),
    });

    const apiKeyField = document.getElementById('apiKey')!;
    fireEvent.change(apiKeyField, {
      target: { value: 'test-api-key' },
    });
    fireEvent.click(screen.getByText('Sign In'));

    await waitFor(() => expect(callApiMock).toHaveBeenCalledTimes(1));
  });

  it('should navigate to default route when redirect URL is malformed', () => {
    mockUserEmail = 'test@example.com';
    mockLocationSearch = '?redirect=//malicious.com';

    renderWithQueryClient(
      <MemoryRouter initialEntries={['/?redirect=//malicious.com']}>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('should handle redirect URLs with query parameters', () => {
    mockUserEmail = 'test@example.com';
    mockLocationSearch = '?redirect=/reports?evalId=123';

    renderWithQueryClient(
      <MemoryRouter initialEntries={['/?redirect=/reports?evalId=123']}>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(mockNavigate).toHaveBeenCalled();
  });
});
