import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LoginPage from './login';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ search: '' }),
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
});
