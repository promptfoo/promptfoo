import { TooltipProvider } from '@app/components/ui/tooltip';
import { RenderOptions, render } from '@testing-library/react';

export interface ProviderOptions {
  darkMode?: boolean;
}

const Providers =
  (options?: ProviderOptions) =>
  ({ children }: { children: React.ReactNode }) => {
    // Set data-theme attribute for Tailwind dark mode
    if (options?.darkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }

    return <TooltipProvider delayDuration={0}>{children}</TooltipProvider>;
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
