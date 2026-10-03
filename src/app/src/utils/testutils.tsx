import { TooltipProvider } from '@app/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';

export const renderWithProviders = (ui: React.ReactNode) =>
  render(ui, {
    wrapper: ({ children }: { children: React.ReactNode }) => {
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
          },
        },
      });

      // Reset the data-theme attribute for Tailwind dark mode
      document.documentElement.removeAttribute('data-theme');

      return (
        <QueryClientProvider client={queryClient}>
          <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
        </QueryClientProvider>
      );
    },
  });
