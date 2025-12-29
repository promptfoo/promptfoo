import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PageShell from './PageShell';

vi.mock('@app/components/Navigation', () => {
  const MockNavigation = ({ onToggleDarkMode }: { onToggleDarkMode: () => void }) => {
    return (
      <div data-testid="navigation-mock">
        <button data-testid="toggle-button" onClick={onToggleDarkMode}>
          Toggle Dark Mode
        </button>
      </div>
    );
  };
  return {
    default: MockNavigation,
  };
});

vi.mock('@app/components/PostHogProvider', () => ({
  PostHogProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./PostHogPageViewTracker', () => ({
  PostHogPageViewTracker: () => <div data-testid="posthog-tracker-mock" />,
}));

vi.mock('@app/components/UpdateBanner', () => {
  const MockUpdateBanner = () => {
    return <div data-testid="update-banner-mock">UpdateBanner</div>;
  };
  return {
    default: MockUpdateBanner,
  };
});

const ThemeDisplay = () => {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return <div data-testid="theme-mode">{isDark ? 'dark' : 'light'}</div>;
};

const renderPageShell = (initialPath = '/', children: React.ReactNode = null) => {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<PageShell />}>
          <Route
            path="*"
            element={
              <>
                <ThemeDisplay />
                {children}
              </>
            }
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
};

describe('PageShell', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');

    // Mock matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should render navigation component', async () => {
    renderPageShell();
    await waitFor(() => {
      expect(screen.getByTestId('navigation-mock')).toBeInTheDocument();
    });
  });

  it('should render update banner', async () => {
    renderPageShell();
    await waitFor(() => {
      expect(screen.getByTestId('update-banner-mock')).toBeInTheDocument();
    });
  });

  it('should render PostHog tracker', async () => {
    renderPageShell();
    await waitFor(() => {
      expect(screen.getByTestId('posthog-tracker-mock')).toBeInTheDocument();
    });
  });

  it('should start in light mode by default when system preference is light', async () => {
    renderPageShell();
    await waitFor(() => {
      expect(screen.getByTestId('theme-mode')).toHaveTextContent('light');
    });
  });

  it('should start in dark mode when system preference is dark', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('dark'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    renderPageShell();
    await waitFor(() => {
      expect(screen.getByTestId('theme-mode')).toHaveTextContent('dark');
    });
  });

  it('should toggle dark mode when toggle button is clicked', async () => {
    renderPageShell();
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByTestId('theme-mode')).toHaveTextContent('light');
    });

    await user.click(screen.getByTestId('toggle-button'));

    await waitFor(() => {
      expect(screen.getByTestId('theme-mode')).toHaveTextContent('dark');
    });
  });

  it('should persist dark mode preference in localStorage', async () => {
    renderPageShell();
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByTestId('theme-mode')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('toggle-button'));

    expect(localStorage.getItem('darkMode')).toBe('true');
  });

  it('should restore dark mode preference from localStorage', async () => {
    localStorage.setItem('darkMode', 'true');

    renderPageShell();

    await waitFor(() => {
      expect(screen.getByTestId('theme-mode')).toHaveTextContent('dark');
    });
  });
});
