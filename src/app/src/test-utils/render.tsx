import type { RenderOptions } from '@testing-library/react';
import { render } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement, ReactNode } from 'react';
import { createAppTheme } from '@app/components/PageShell';

export interface ProviderOptions {
  darkMode?: boolean;
}

/**
 * Custom render function that wraps components with commonly needed providers
 *
 * @example
 * ```typescript
 * import { renderWithProviders } from '@app/test-utils';
 *
 * it('renders with theme', () => {
 *   renderWithProviders(<MyComponent />);
 *   expect(screen.getByText('Hello')).toBeInTheDocument();
 * });
 *
 * // With dark mode
 * it('renders in dark mode', () => {
 *   renderWithProviders(<MyComponent />, {}, { darkMode: true });
 * });
 * ```
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
  providerOptions?: ProviderOptions,
) {
  const theme = createAppTheme(providerOptions?.darkMode || false);

  function Wrapper({ children }: { children: ReactNode }) {
    return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
  }

  return render(ui, { wrapper: Wrapper, ...options });
}

/**
 * Custom render function that wraps components with Router and Theme providers
 *
 * @example
 * ```typescript
 * import { renderWithRouter } from '@app/test-utils';
 *
 * it('renders with routing', () => {
 *   renderWithRouter(<MyComponent />, { initialRoute: '/dashboard' });
 *   expect(screen.getByText('Dashboard')).toBeInTheDocument();
 * });
 * ```
 */
export function renderWithRouter(
  ui: ReactElement,
  {
    initialRoute = '/',
    darkMode = false,
    ...options
  }: Omit<RenderOptions, 'wrapper'> & { initialRoute?: string; darkMode?: boolean } = {},
) {
  const theme = createAppTheme(darkMode);

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ThemeProvider theme={theme}>
        <MemoryRouter initialEntries={[initialRoute]}>{children}</MemoryRouter>
      </ThemeProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...options });
}

/**
 * Creates the app theme for testing
 * Uses the same theme as the application for consistency
 *
 * @example
 * ```typescript
 * import { createTestTheme } from '@app/test-utils';
 *
 * const darkTheme = createTestTheme(true);
 * const lightTheme = createTestTheme(false);
 * ```
 */
export function createTestTheme(darkMode = false) {
  return createAppTheme(darkMode);
}
