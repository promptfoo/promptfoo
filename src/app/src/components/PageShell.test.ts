import { describe, it, expect } from 'vitest';
import { createAppTheme } from './PageShell';

describe('createAppTheme', () => {
  it('should create light theme correctly', () => {
    const theme = createAppTheme(false);

    expect(theme.palette.mode).toBe('light');
    expect(theme.palette.background.default).toBe('#f8fafc');
    expect(theme.palette.background.paper).toBe('#ffffff');
    expect(theme.palette.text.primary).toBe('#0f172a');
    expect(theme.palette.text.secondary).toBe('#475569');
    expect(theme.palette.primary.main).toBe('#2563eb');
    expect(theme.palette.secondary.main).toBe('#8b5cf6');
  });

  it('should create dark theme correctly', () => {
    const theme = createAppTheme(true);

    expect(theme.palette.mode).toBe('dark');
    expect(theme.palette.background.default).toBe('#0f172a');
    expect(theme.palette.background.paper).toBe('#1e293b');
    expect(theme.palette.text.primary).toBe('#f1f5f9');
    expect(theme.palette.text.secondary).toBe('#94a3b8');
    expect(theme.palette.primary.main).toBe('#2563eb');
    expect(theme.palette.secondary.main).toBe('#8b5cf6');
  });

  it('should configure typography correctly', () => {
    const theme = createAppTheme(false);

    expect(theme.typography.fontFamily).toBe('"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    expect(theme.typography.button.textTransform).toBe('none');
    expect(theme.typography.button.fontWeight).toBe(500);
  });

  it('should configure component styles correctly', () => {
    const lightTheme = createAppTheme(false);
    const darkTheme = createAppTheme(true);

    // Test button styles
    expect(lightTheme.components?.MuiButton?.styleOverrides?.root?.borderRadius).toBe('8px');
    expect(darkTheme.components?.MuiButton?.styleOverrides?.root?.borderRadius).toBe('8px');

    // Test card styles
    expect(lightTheme.components?.MuiCard?.styleOverrides?.root?.backgroundColor).toBe('#ffffff');
    expect(darkTheme.components?.MuiCard?.styleOverrides?.root?.backgroundColor).toBe('#1e293b');

    // Test table styles
    expect(lightTheme.components?.MuiTableHead?.styleOverrides?.root?.backgroundColor).toBe('#f8fafc');
    expect(darkTheme.components?.MuiTableHead?.styleOverrides?.root?.backgroundColor).toBe('#334155');
  });
});
