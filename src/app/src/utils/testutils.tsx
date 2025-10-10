import { createAppTheme } from '@app/components/PageShell';
import { ThemeProvider } from '@mui/material/styles';
import { RenderOptions, render } from '@testing-library/react';

export interface ProviderOptions {
  darkMode?: boolean;
}

const Providers =
  (options?: ProviderOptions) =>
  ({ children }: { children: React.ReactNode }) => {
    const theme = createAppTheme(options?.darkMode || false);
    return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
  };

export const renderWithProviders = (
  ui: React.ReactNode,
  options?: RenderOptions,
  providerOptions?: ProviderOptions,
) => {
  return render(ui, {
    ...options,
    wrapper: Providers(providerOptions),
  });
};
