import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LogoutButton from './LogoutButton';

const mockNavigate = vi.fn();
const mockLogout = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@app/stores/userStore', () => ({
  useUserStore: () => ({
    logout: mockLogout,
  }),
}));

describe('LogoutButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders logout button', () => {
    render(
      <MemoryRouter>
        <LogoutButton />
      </MemoryRouter>,
    );

    expect(screen.getByText('Logout')).toBeInTheDocument();
  });

  it('calls logout and navigates on successful logout', async () => {
    mockLogout.mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <LogoutButton />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('Logout'));

    await waitFor(() => expect(mockLogout).toHaveBeenCalledTimes(1));
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });

  it('shows loading state during logout', async () => {
    let resolveLogout: () => void;
    const logoutPromise = new Promise<void>((resolve) => {
      resolveLogout = resolve;
    });
    mockLogout.mockReturnValue(logoutPromise);

    render(
      <MemoryRouter>
        <LogoutButton />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('Logout'));

    // Should show loading spinner
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();

    // Resolve the logout
    resolveLogout!();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login'));
  });

  it('handles logout error gracefully', async () => {
    mockLogout.mockRejectedValue(new Error('Logout failed'));
    const consoleErrorSpy = vi.spyOn(console, 'error');

    render(
      <MemoryRouter>
        <LogoutButton />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('Logout'));

    await waitFor(() => expect(mockLogout).toHaveBeenCalledTimes(1));
    expect(consoleErrorSpy).toHaveBeenCalledWith('Logout error:', expect.any(Error));
  });
});
