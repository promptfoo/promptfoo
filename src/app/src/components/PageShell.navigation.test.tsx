import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PageShell from './PageShell';
import userEvent from '@testing-library/user-event';
import useMediaQuery from '@mui/material/useMediaQuery';

// Mock components
vi.mock('@app/components/Navigation', () => {
  const MockNavigation = ({
    darkMode,
    onToggleDarkMode,
  }: {
    darkMode: boolean;
    onToggleDarkMode: () => void;
  }) => {
    return (
      <div data-testid="navigation">
        <button data-testid="toggle-button" onClick={onToggleDarkMode}>
          Toggle Dark Mode
        </button>
        <div>Dark Mode: {darkMode ? 'true' : 'false'}</div>
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
  PostHogPageViewTracker: () => <div data-testid="posthog-tracker" />,
}));

vi.mock('@mui/material/useMediaQuery');

const renderPageShell = (initialPath = '/') => {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/*" element={<PageShell />}>
          <Route path="eval/:evalId" element={<div>Eval Page</div>} />
          <Route path="evals" element={<div>Evals List</div>} />
          <Route path="*" element={<div>Other Page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
};

describe('PageShell - Navigation Visibility', () => {
  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('Initial navigation visibility', () => {
    it('should show navigation by default on eval pages', async () => {
      renderPageShell('/eval/123');

      await waitFor(() => {
        expect(screen.getByTestId('navigation')).toBeInTheDocument();
      });
    });

    it('should show navigation on non-eval pages', async () => {
      renderPageShell('/evals');

      await waitFor(() => {
        expect(screen.getByTestId('navigation')).toBeInTheDocument();
      });
    });

    it('should show navigation on home page', async () => {
      renderPageShell('/');

      await waitFor(() => {
        expect(screen.getByTestId('navigation')).toBeInTheDocument();
      });
    });
  });
});

describe('PageShell - Dark Mode Toggle', () => {
  const mockUseMediaQuery = vi.mocked(useMediaQuery);

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('should toggle dark mode and update localStorage', async () => {
    mockUseMediaQuery.mockReturnValue(false);
    localStorage.setItem('darkMode', 'false');

    renderPageShell('/');

    await waitFor(() => {
      expect(screen.getByText('Dark Mode: false')).toBeInTheDocument();
    });

    const toggleButton = screen.getByTestId('toggle-button');
    await userEvent.click(toggleButton);

    await waitFor(() => {
      expect(screen.getByText('Dark Mode: true')).toBeInTheDocument();
      expect(localStorage.getItem('darkMode')).toBe('true');
    });
  });

  it('should set data-theme attribute based on dark mode', async () => {
    mockUseMediaQuery.mockReturnValue(false);
    localStorage.setItem('darkMode', 'true');

    renderPageShell('/');

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
  });
});