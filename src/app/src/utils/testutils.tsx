import { createAppTheme } from '@app/components/PageShell';
import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RenderOptions, render } from '@testing-library/react';

export interface ProviderOptions {
  darkMode?: boolean;
}

const Providers =
  (options?: ProviderOptions) =>
  ({ children }: { children: React.ReactNode }) => {
    const theme = createAppTheme(options?.darkMode || false);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>{children}</ThemeProvider>
      </QueryClientProvider>
    );
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
