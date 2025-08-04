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

// Mock the store
const mockUseResultsViewSettingsStore = vi.fn();
vi.mock('@app/pages/eval/components/store', () => ({
  useResultsViewSettingsStore: (...args: any[]) => mockUseResultsViewSettingsStore(...args),
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
  beforeEach(() => {
    // Default mock implementation - return false for topAreaCollapsed
    mockUseResultsViewSettingsStore.mockImplementation((selector?: any) => {
      if (typeof selector === 'function') {
        // Zustand selector pattern
        return selector({ topAreaCollapsed: false });
      }
      // Full state
      return { topAreaCollapsed: false };
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('Navigation visibility based on topAreaCollapsed', () => {
    it('should show navigation when topAreaCollapsed is false', async () => {
      mockUseResultsViewSettingsStore.mockImplementation((selector?: any) => {
        if (typeof selector === 'function') {
          return selector({ topAreaCollapsed: false });
        }
        return { topAreaCollapsed: false };
      });

      renderPageShell('/eval/123');

      await waitFor(() => {
        expect(screen.getByTestId('navigation')).toBeInTheDocument();
      });
    });

    it('should hide navigation on eval pages when topAreaCollapsed is true', async () => {
      mockUseResultsViewSettingsStore.mockImplementation((selector?: any) => {
        if (typeof selector === 'function') {
          return selector({ topAreaCollapsed: true });
        }
        return { topAreaCollapsed: true };
      });

      renderPageShell('/eval/123');

      await waitFor(() => {
        expect(screen.queryByTestId('navigation')).not.toBeInTheDocument();
      });
    });

    it('should always show navigation on non-eval pages even when topAreaCollapsed is true', async () => {
      mockUseResultsViewSettingsStore.mockImplementation((selector?: any) => {
        if (typeof selector === 'function') {
          return selector({ topAreaCollapsed: true });
        }
        return { topAreaCollapsed: true };
      });

      renderPageShell('/evals');

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
