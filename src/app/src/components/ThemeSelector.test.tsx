import { TooltipProvider } from '@app/components/ui/tooltip';
import {
  mockMatchMedia as installMatchMedia,
  mockBrowserProperty,
  restoreBrowserMocks,
} from '@app/tests/browserMocks';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ThemeSelector from './ThemeSelector';

const SYSTEM_DARK_MODE_QUERY = '(prefers-color-scheme: dark)';

let matchMedia: ReturnType<typeof installMatchMedia>;

const renderThemeSelector = () => {
  return render(
    <TooltipProvider delayDuration={0}>
      <ThemeSelector />
    </TooltipProvider>,
  );
};

const installSystemTheme = (isDark = false) => {
  matchMedia = installMatchMedia({
    matches: (query) => query === SYSTEM_DARK_MODE_QUERY && isDark,
  });
};

const emitSystemThemeChange = (matches: boolean) => {
  let darkModeQueryCallIndex = -1;
  for (let index = matchMedia.mock.calls.length - 1; index >= 0; index -= 1) {
    const [query] = matchMedia.mock.calls[index];
    if (query === SYSTEM_DARK_MODE_QUERY) {
      darkModeQueryCallIndex = index;
      break;
    }
  }

  if (darkModeQueryCallIndex === -1) {
    throw new Error(
      `Cannot emit system theme change: no matchMedia call for ${SYSTEM_DARK_MODE_QUERY}`,
    );
  }

  const mediaQueryList = matchMedia.mock.results[darkModeQueryCallIndex]?.value as MediaQueryList;

  act(() => {
    mediaQueryList.dispatchEvent({ matches } as MediaQueryListEvent);
  });
};

const getThemeButton = () => screen.getByRole('button', { name: /theme preference/i });

describe('ThemeSelector', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
    installSystemTheme();
  });

  afterEach(() => {
    restoreBrowserMocks();
  });

  it('renders a compact three-way theme button', () => {
    renderThemeSelector();

    expect(
      screen.getByRole('button', {
        name: 'Theme preference: System theme (light). Switch to Dark theme.',
      }),
    ).toHaveClass('size-9');
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('cycles through system, dark, light, and back to system', async () => {
    const user = userEvent.setup();
    renderThemeSelector();

    await user.click(
      screen.getByRole('button', {
        name: 'Theme preference: System theme (light). Switch to Dark theme.',
      }),
    );
    expect(
      screen.getByRole('button', {
        name: 'Theme preference: Dark theme. Switch to Light theme.',
      }),
    ).toBeInTheDocument();

    await user.click(getThemeButton());
    expect(
      screen.getByRole('button', {
        name: 'Theme preference: Light theme. Switch to System theme.',
      }),
    ).toBeInTheDocument();

    await user.click(getThemeButton());
    expect(
      screen.getByRole('button', {
        name: 'Theme preference: System theme (light). Switch to Dark theme.',
      }),
    ).toBeInTheDocument();
  });

  it('uses the system preference when no explicit preference is stored', async () => {
    restoreBrowserMocks();
    installSystemTheme(true);

    renderThemeSelector();

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
    expect(localStorage.getItem('darkMode')).toBeNull();
  });

  it('uses the system preference when localStorage reads are blocked', async () => {
    restoreBrowserMocks();
    installSystemTheme(true);
    mockBrowserProperty(window, 'localStorage', {
      getItem: vi.fn(() => {
        throw new Error('localStorage blocked');
      }),
      removeItem: vi.fn(),
      setItem: vi.fn(),
    } as unknown as Storage);

    renderThemeSelector();

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
  });

  it('falls back to light when matchMedia is unavailable', () => {
    restoreBrowserMocks();
    mockBrowserProperty(window, 'matchMedia', undefined);

    renderThemeSelector();

    expect(
      screen.getByRole('button', {
        name: 'Theme preference: System theme (light). Switch to Dark theme.',
      }),
    ).toBeInTheDocument();
  });

  it('falls back to light when matchMedia throws', () => {
    restoreBrowserMocks();
    mockBrowserProperty(
      window,
      'matchMedia',
      vi.fn(() => {
        throw new Error('matchMedia blocked');
      }),
    );

    renderThemeSelector();

    expect(
      screen.getByRole('button', {
        name: 'Theme preference: System theme (light). Switch to Dark theme.',
      }),
    ).toBeInTheDocument();
  });

  it('uses legacy media query listeners when change event listeners are unavailable', async () => {
    restoreBrowserMocks();

    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const addListener = vi.fn((listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    });
    const removeListener = vi.fn((listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    });

    mockBrowserProperty(
      window,
      'matchMedia',
      vi.fn(
        () =>
          ({
            addEventListener: undefined,
            addListener,
            dispatchEvent: vi.fn(),
            matches: false,
            media: SYSTEM_DARK_MODE_QUERY,
            onchange: null,
            removeEventListener: undefined,
            removeListener,
          }) as unknown as MediaQueryList,
      ),
    );

    const { unmount } = renderThemeSelector();

    expect(addListener).toHaveBeenCalledTimes(1);

    act(() => {
      listeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent));
    });

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    unmount();

    expect(removeListener).toHaveBeenCalledTimes(1);
  });

  it('persists explicit dark and light preferences', async () => {
    const user = userEvent.setup();
    renderThemeSelector();

    await user.click(getThemeButton());

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(localStorage.getItem('darkMode')).toBe('true');

    await user.click(getThemeButton());

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    });
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(localStorage.getItem('darkMode')).toBe('false');
  });

  it('removes an explicit preference when system is selected', async () => {
    const user = userEvent.setup();
    localStorage.setItem('darkMode', 'false');
    renderThemeSelector();

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    });

    await user.click(getThemeButton());

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    });
    expect(localStorage.getItem('darkMode')).toBeNull();
  });

  it('syncs back to system when localStorage is cleared in another tab', async () => {
    localStorage.setItem('darkMode', 'true');
    renderThemeSelector();

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    localStorage.clear();
    act(() => {
      window.dispatchEvent(Object.assign(new Event('storage'), { key: null }));
    });

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    });
    expect(
      screen.getByRole('button', {
        name: 'Theme preference: System theme (light). Switch to Dark theme.',
      }),
    ).toBeInTheDocument();
  });

  it('follows system changes only when system preference is selected', async () => {
    const user = userEvent.setup();
    renderThemeSelector();

    emitSystemThemeChange(true);

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    await user.click(getThemeButton());
    emitSystemThemeChange(false);

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
  });
});
