import { type ApiHealthResult, useApiHealth } from '@app/hooks/useApiHealth';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LauncherPage from './page';
import type { DefinedUseQueryResult } from '@tanstack/react-query';
import type { Mock } from 'vitest';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});

const mockMatchMedia = vi.fn();
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: mockMatchMedia,
});

mockMatchMedia.mockImplementation((query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

const renderLauncher = () => {
  return render(
    <MemoryRouter>
      <LauncherPage />
    </MemoryRouter>,
  );
};

vi.mock('@app/hooks/useApiHealth', () => ({
  useApiHealth: vi.fn().mockReturnValue({
    data: { status: 'unknown', message: null },
    refetch: vi.fn(),
    isLoading: false,
  } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>),
}));

describe('LauncherPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockLocalStorage.getItem.mockReset();
    mockLocalStorage.setItem.mockReset();
    mockMatchMedia.mockReset();
    mockMatchMedia.mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders welcome message', async () => {
    renderLauncher();
    await waitFor(() => {
      expect(screen.getByText('Welcome to Promptfoo')).toBeInTheDocument();
    });
  });

  it('shows connecting status initially', async () => {
    renderLauncher();
    await waitFor(() => {
      expect(screen.getByText(/Connecting to Promptfoo on localhost:15500/)).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });

  it('loads dark mode preference from localStorage', async () => {
    mockLocalStorage.getItem.mockReturnValue('true');
    renderLauncher();

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
  });

  it('toggles dark mode when button is clicked', async () => {
    mockLocalStorage.getItem.mockReturnValue('false');
    document.documentElement.removeAttribute('data-theme'); // Ensure light mode at start
    renderLauncher();

    // Wait for the page to finish loading and render the dark mode toggle
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Switch to (dark|light) mode/i }),
      ).toBeInTheDocument();
    });

    const darkModeButton = screen.getByRole('button', { name: /Switch to (dark|light) mode/i });
    await act(async () => {
      await userEvent.click(darkModeButton);
    });

    expect(mockLocalStorage.setItem).toHaveBeenCalledWith('darkMode', 'true');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('displays getting started instructions', async () => {
    renderLauncher();

    await waitFor(() => {
      expect(screen.getByText('Getting Started')).toBeInTheDocument();
      expect(screen.getByText(/promptfoo view -n/)).toBeInTheDocument();
      expect(screen.getByText(/npx promptfoo@latest view -n/)).toBeInTheDocument();
    });
  });

  it('displays browser support information', async () => {
    renderLauncher();

    await waitFor(() => {
      expect(screen.getByText('Using Safari or Brave?')).toBeInTheDocument();
      expect(screen.getByText(/mkcert -install/)).toBeInTheDocument();
      expect(screen.getByText(/On Brave you can disable Brave Shields./)).toBeInTheDocument();
    });
  });

  it('contains correct links', async () => {
    renderLauncher();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /installation guide/i })).toHaveAttribute(
        'href',
        'https://promptfoo.dev/docs/installation',
      );
      expect(screen.getByRole('link', { name: /mkcert installation steps/i })).toHaveAttribute(
        'href',
        'https://github.com/FiloSottile/mkcert#installation',
      );
    });
  });

  it('uses system preference for dark mode when no localStorage value exists', async () => {
    mockLocalStorage.getItem.mockReturnValue(null);
    mockMatchMedia.mockImplementation((query) => ({
      matches: query === '(prefers-color-scheme: dark)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    renderLauncher();
    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
  });

  it('should call checkHealth every 2 seconds after the initial 3-second delay', async () => {
    vi.useFakeTimers();

    const checkHealthMock = vi.fn();
    (useApiHealth as Mock).mockReturnValue({
      data: { status: 'unknown', message: null },
      refetch: checkHealthMock,
      isLoading: false,
    } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

    renderLauncher();

    vi.advanceTimersByTime(3000);
    expect(checkHealthMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000);
    expect(checkHealthMock).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(2000);
    expect(checkHealthMock).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });
});
