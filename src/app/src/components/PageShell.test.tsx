import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PageShell from './PageShell';

vi.mock('@mui/material/useMediaQuery');

vi.mock('@app/components/Navigation', () => {
  const MockNavigation = ({
    darkMode,
    onToggleDarkMode,
  }: {
    darkMode: boolean;
    onToggleDarkMode: () => void;
  }) => {
    return (
      <div data-testid="navigation-mock">
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
  PostHogPageViewTracker: () => <div data-testid="posthog-tracker-mock" />,
}));

const ThemeDisplay = () => {
  const theme = useTheme();
  return <div data-testid="theme-mode">{theme.palette.mode}</div>;
};

const renderPageShell = (initialPath = '/', children: React.ReactNode = null) => {
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

describe('PageShell', () => {
  const mockUseMediaQuery = vi.mocked(useMediaQuery);

  beforeEach(() => {
    mockUseMediaQuery.mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  describe('Theme Initialization', () => {
    it.each([
      {
        storageValue: 'true',
        expectedMode: 'dark',
        shouldHaveDataTheme: true,
        description: 'dark',
      },
      {
        storageValue: 'false',
        expectedMode: 'light',
        shouldHaveDataTheme: false,
        description: 'light',
      },
    ])(
      'should render with $description theme when localStorage has darkMode set to "$storageValue"',
      async ({ storageValue, expectedMode, shouldHaveDataTheme }) => {
        localStorage.setItem('darkMode', storageValue);

        renderPageShell('/', <ThemeDisplay />);

        await waitFor(() => {
          expect(screen.getByTestId('theme-mode')).toHaveTextContent(expectedMode);
        });

        if (shouldHaveDataTheme) {
          expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
        } else {
          expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
        }
      },
    );

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

    it('should handle hydration mismatch by updating theme based on client-side preference', async () => {
      mockUseMediaQuery.mockReturnValueOnce(true);
      mockUseMediaQuery.mockReturnValueOnce(false);

      renderPageShell('/', <ThemeDisplay />);

      await waitFor(() => {
        expect(screen.getByTestId('theme-mode')).toHaveTextContent('light');
      });

      expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    });
  });

  it('should pass the correct darkMode value and toggleDarkMode callback to the Navigation component', async () => {
    localStorage.setItem('darkMode', 'true');
    renderPageShell();

    await waitFor(() => {
      expect(screen.getByText('darkMode: true')).toBeInTheDocument();
    });

    localStorage.setItem('darkMode', 'false');
    renderPageShell();

    await waitFor(() => {
      expect(screen.getByText('darkMode: false')).toBeInTheDocument();
    });
  });

  it('should toggle between darkTheme and lightTheme and update localStorage when toggleDarkMode is called', async () => {
    localStorage.setItem('darkMode', 'false');

    renderPageShell('/', <ThemeDisplay />);

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
