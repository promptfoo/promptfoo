import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LauncherPage from './page';

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
    renderLauncher();

    const darkModeButton = await screen.findByRole('button', { name: /Switch to dark mode/i });
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
});
