import { render as rtlRender, RenderOptions } from '@testing-library/react';
import React from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// Custom render function that wraps components with providers
export function render(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return rtlRender(ui, options);
}

// Render with theme wrapper
export function renderWithTheme(ui: React.ReactElement) {
  const theme = createTheme({ palette: { mode: 'light' } });
  return rtlRender(
    <ThemeProvider theme={theme}>{ui as any}</ThemeProvider>
  );
}

// Re-export everything
export * from '@testing-library/react';
export { render as customRender };