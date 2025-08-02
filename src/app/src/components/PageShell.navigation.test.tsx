import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PageShell from './PageShell';
import { useState } from 'react';
import { act } from 'react-dom/test-utils';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import userEvent from '@testing-library/user-event';

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
        <div>darkMode: {String(darkMode)}</div>
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

  describe('Path-based navigation visibility', () => {
    it.each([
      { path: '/eval/123', shouldHide: true, description: 'eval detail page' },
      { path: '/eval/456/table', shouldHide: true, description: 'eval table view' },
      { path: '/evals', shouldHide: false, description: 'evals list page' },
      { path: '/setup', shouldHide: false, description: 'setup page' },
      { path: '/prompts', shouldHide: false, description: 'prompts page' },
      { path: '/', shouldHide: false, description: 'home page' },
    ])(
      'should ${shouldHide ? "hide" : "show"} navigation on $description when collapsed',
      async ({ path, shouldHide }) => {
        mockUseResultsViewSettingsStore.mockImplementation((selector?: any) => {
          if (typeof selector === 'function') {
            return selector({ topAreaCollapsed: true });
          }
          return { topAreaCollapsed: true };
        });

        renderPageShell(path);

        await waitFor(() => {
          if (shouldHide) {
            expect(screen.queryByTestId('navigation')).not.toBeInTheDocument();
          } else {
            expect(screen.getByTestId('navigation')).toBeInTheDocument();
          }
        });
      },
    );
  });

  describe('Store state changes', () => {
    it('should react to store state changes', async () => {
      let topAreaCollapsed = false;
      mockUseResultsViewSettingsStore.mockImplementation((selector?: any) => {
        if (typeof selector === 'function') {
          return selector({ topAreaCollapsed });
        }
        return { topAreaCollapsed };
      });

      const { rerender } = renderPageShell('/eval/123');

      // Initially visible
      await waitFor(() => {
        expect(screen.getByTestId('navigation')).toBeInTheDocument();
      });

      // Update store state and rerender
      topAreaCollapsed = true;
      rerender(
        <MemoryRouter initialEntries={['/eval/123']}>
          <Routes>
            <Route path="/*" element={<PageShell />}>
              <Route path="eval/:evalId" element={<div>Eval Page</div>} />
            </Route>
          </Routes>
        </MemoryRouter>,
      );

      // Should be hidden after state change
      await waitFor(() => {
        expect(screen.queryByTestId('navigation')).not.toBeInTheDocument();
      });
    });
  });

  it('should hide navigation on deeply nested eval paths when topAreaCollapsed is true', async () => {
    mockUseResultsViewSettingsStore.mockImplementation((selector?: any) => {
      if (typeof selector === 'function') {
        return selector({ topAreaCollapsed: true });
      }
      return { topAreaCollapsed: true };
    });

    renderPageShell('/eval/123/some/nested/path');

    await waitFor(() => {
      expect(screen.queryByTestId('navigation')).not.toBeInTheDocument();
    });
  });

  it.each([
    { path: '/eval/%20123', shouldHide: true, description: 'eval detail page with space encoded' },
    {
      path: '/eval/test%2Fpath',
      shouldHide: true,
      description: 'eval detail page with slash encoded',
    },
  ])(
    'should ${shouldHide ? "hide" : "show"} navigation on $description when topAreaCollapsed is true',
    async ({ path, shouldHide }) => {
      mockUseResultsViewSettingsStore.mockImplementation((selector?: any) => {
        if (typeof selector === 'function') {
          return selector({ topAreaCollapsed: true });
        }
        return { topAreaCollapsed: true };
      });

      renderPageShell(path);

      await waitFor(() => {
        if (shouldHide) {
          expect(screen.queryByTestId('navigation')).not.toBeInTheDocument();
        } else {
          expect(screen.getByTestId('navigation')).toBeInTheDocument();
        }
      });
    },
  );
});

describe('PageShell - Navigation Visibility on route change without remount', () => {
  const RouteUpdater = () => {
    const navigate = useNavigate();
    const [currentPath, setCurrentPath] = useState('/');

    const updateRoute = (newPath: string) => {
      act(() => {
        setCurrentPath(newPath);
        navigate(newPath);
      });
    };

    return (
      <div>
        <button data-testid="route-updater" onClick={() => updateRoute('/eval/123')}>
          Go to Eval Page
        </button>
        <button data-testid="route-back" onClick={() => updateRoute('/')}>
          Go Back
        </button>
        <div>Current Path: {currentPath}</div>
      </div>
    );
  };

  const renderPageShellWithRouteUpdater = (initialPath = '/') => {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <RouteUpdater />
        <Routes>
          <Route path="/*" element={<PageShell />}>
            <Route index element={<div>Home Page</div>} />
            <Route path="eval/:evalId" element={<div>Eval Page</div>} />
            <Route path="*" element={<div>Other Page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  };

  beforeEach(() => {
    mockUseResultsViewSettingsStore.mockImplementation((selector?: any) => {
      if (typeof selector === 'function') {
        return selector({ topAreaCollapsed: false });
      }
      return { topAreaCollapsed: false };
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should update navigation visibility when route changes from non-eval to eval and back', async () => {
    mockUseResultsViewSettingsStore.mockImplementation((selector?: any) => {
      if (typeof selector === 'function') {
        return selector({ topAreaCollapsed: true });
      }
      return { topAreaCollapsed: true };
    });

    renderPageShellWithRouteUpdater('/');

    await waitFor(() => {
      expect(screen.getByTestId('navigation')).toBeInTheDocument();
    });

    const goToEvalButton = screen.getByTestId('route-updater');
    goToEvalButton.click();

    await waitFor(() => {
      expect(screen.queryByTestId('navigation')).not.toBeInTheDocument();
    });

    const goBackButton = screen.getByTestId('route-back');
    goBackButton.click();

    await waitFor(() => {
      expect(screen.getByTestId('navigation')).toBeInTheDocument();
    });
  });
});

describe('PageShell - Theme', () => {
  const mockUseMediaQuery = vi.mocked(useMediaQuery);

  beforeEach(() => {
    mockUseMediaQuery.mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it.each([
    { darkMode: true, expectedAttribute: 'dark' },
    { darkMode: false, expectedAttribute: null },
  ])(
    'should set data-theme="$expectedAttribute" on document element when darkMode is $darkMode',
    async ({ darkMode, expectedAttribute }) => {
      localStorage.setItem('darkMode', String(darkMode));

      renderPageShell();

      await waitFor(() => {
        if (expectedAttribute) {
          expect(document.documentElement.getAttribute('data-theme')).toBe(expectedAttribute);
        } else {
          expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
        }
      });
    },
  );
});

describe('PageShell - Dark Mode Toggle', () => {
  const ThemeDisplay = () => {
    const theme = useTheme();
    return <div data-testid="theme-mode">{theme.palette.mode}</div>;
  };

  const renderPageShellWithTheme = (initialPath = '/', children: React.ReactNode = null) => {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/" element={<PageShell />}>
            {children && <Route index element={children} />}
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  };

  const mockUseMediaQuery = vi.mocked(useMediaQuery);

  beforeEach(() => {
    mockUseMediaQuery.mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('should toggle between darkTheme and lightTheme and update localStorage when toggleDarkMode is called', async () => {
    localStorage.setItem('darkMode', 'false');

    renderPageShellWithTheme('/', <ThemeDisplay />);

    await waitFor(() => {
      expect(screen.getByTestId('theme-mode')).toHaveTextContent('light');
    });

    const toggleButton = screen.getByTestId('toggle-button');
    userEvent.click(toggleButton);

    await waitFor(() => {
      expect(screen.getByTestId('theme-mode')).toHaveTextContent('dark');
    });
    expect(localStorage.getItem('darkMode')).toBe('true');

    userEvent.click(toggleButton);

    await waitFor(() => {
      expect(screen.getByTestId('theme-mode')).toHaveTextContent('light');
    });
    expect(localStorage.getItem('darkMode')).toBe('false');
  });
});
