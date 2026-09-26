import { useUserStore } from '@app/stores/userStore';
import { callApi } from '@app/utils/api';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
  fetchUserId: vi.fn(),
}));

const initialState = useUserStore.getState();
const callApiMock = vi.mocked(callApi);
const renderLogin = () =>
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );

async function submitApiKey(apiKey = 'test-api-key') {
  const user = userEvent.setup();
  const field = await screen.findByLabelText('API Key');
  if (apiKey) {
    await user.type(field, apiKey);
  }
  await user.click(screen.getByRole('button', { name: /sign in/i }));
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockLocationSearch = '';
    useUserStore.setState(initialState, true);
    callApiMock.mockResolvedValue(Response.json({ email: null }));
  });

  afterEach(() => {
    act(() => useUserStore.setState(initialState, true));
    vi.resetAllMocks();
  });

  it('loads the saved email through the real user store before showing the form', async () => {
    renderLogin();
    await screen.findByLabelText('API Key');
    expect(callApiMock).toHaveBeenCalledWith('/user/email', { cache: 'no-store' });
    expect(useUserStore.getState()).toMatchObject({ email: null, isLoading: false });
  });

  it('shows loading while the saved identity is being fetched', async () => {
    let finish!: (response: Response) => void;
    callApiMock.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderLogin();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    await act(async () => finish(Response.json({ email: null })));
    await screen.findByLabelText('API Key');
  });

  it('submits the actual form action, updates the real store, and uses the latest redirect', async () => {
    mockLocationSearch = '?redirect=/initial';
    const { rerender } = renderLogin();
    await screen.findByLabelText('API Key');
    callApiMock.mockResolvedValue(Response.json({ user: { email: 'test@example.com' } }));
    mockLocationSearch = '?redirect=/updated?view=all';
    rerender(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    await submitApiKey('  test-api-key  ');

    await waitFor(() => expect(useUserStore.getState().email).toBe('test@example.com'));
    expect(callApiMock).toHaveBeenCalledWith('/user/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'test-api-key', apiHost: 'https://www.promptfoo.app' }),
    });
    expect(mockNavigate).toHaveBeenCalledWith('/updated?view=all');
  });

  it('disables the form while authentication is pending', async () => {
    renderLogin();
    await screen.findByLabelText('API Key');
    let finish!: (response: Response) => void;
    callApiMock.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await submitApiKey();
    expect(screen.getByLabelText('API Key')).toBeDisabled();
    expect(screen.getByLabelText('API Host')).toBeDisabled();
    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
    await act(async () => finish(Response.json({ error: 'Invalid API key' }, { status: 401 })));
    expect(await screen.findByText('Invalid API key')).toBeInTheDocument();
    expect(screen.getByLabelText('API Key')).toBeEnabled();
  });

  it('rejects an empty key without calling the login endpoint', async () => {
    renderLogin();
    await submitApiKey('');
    expect(await screen.findByText('Please enter your API key')).toBeInTheDocument();
    expect(callApiMock).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it.each([
    [
      'API error',
      () =>
        Promise.resolve(
          Response.json({ error: 'Invalid API key or authentication failed' }, { status: 401 }),
        ),
      'Invalid API key or authentication failed',
    ],
    [
      'non-JSON error',
      () => Promise.resolve(new Response('Unavailable', { status: 503 })),
      'Authentication failed. Please check your API key.',
    ],
    [
      'network error',
      () => Promise.reject(new Error('Connection failed')),
      'Network error. Please check your connection and try again.',
    ],
  ] as const)('shows an %s without changing the user store', async (_name, response, message) => {
    renderLogin();
    await screen.findByLabelText('API Key');
    callApiMock.mockImplementation(response);
    await submitApiKey();
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(useUserStore.getState().email).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it.each([
    ['?redirect=/test-redirect', '/test-redirect'],
    ['?redirect=', '/'],
    ['?redirect=/non-existent-route', '/non-existent-route'],
    ['?redirect=unrecognized', '/'],
    ['?redirect=%', '/'],
    ['?redirect=/some-page?param1=value1&param2=value2', '/some-page?param1=value1&param2=value2'],
  ])('redirects a saved user for %s', (search, expected) => {
    useUserStore.setState({ email: 'test@example.com', isLoading: false });
    mockLocationSearch = search;
    renderLogin();
    expect(mockNavigate).toHaveBeenCalledWith(expected);
    expect(callApiMock).not.toHaveBeenCalled();
  });

  it('displays the report title', async () => {
    mockLocationSearch = '?type=report';
    renderLogin();
    expect(await screen.findByText('View Report')).toBeInTheDocument();
  });

  it('shows and hides the API key', async () => {
    const user = userEvent.setup();
    renderLogin();
    const field = await screen.findByLabelText('API Key');
    const toggle = screen.getByLabelText(/toggle API key visibility/i);
    expect(field).toHaveAttribute('type', 'password');
    await user.click(toggle);
    expect(field).toHaveAttribute('type', 'text');
    await user.click(toggle);
    expect(field).toHaveAttribute('type', 'password');
  });
});
