import React from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

const theme = createTheme();

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialTheme?: typeof theme;
}

export function renderWithProviders(ui: React.ReactElement, options?: CustomRenderOptions) {
  const { initialTheme = theme, ...renderOptions } = options ?? {};

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <ThemeProvider theme={initialTheme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

// Re-export everything
export * from '@testing-library/react';
