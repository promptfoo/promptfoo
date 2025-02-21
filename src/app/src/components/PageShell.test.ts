import { describe, it, expect } from 'vitest';
import { createAppTheme, Layout } from './PageShell';

describe('createAppTheme', () => {
  it('should create light theme correctly', () => {
    const theme = createAppTheme(false);

    expect(theme.palette.mode).toBe('light');
    expect(theme.palette.primary.main).toBe('#2563eb');
    expect(theme.palette.background.default).toBe('#f8fafc');
    expect(theme.palette.background.paper).toBe('#ffffff');
    expect(theme.palette.text.primary).toBe('#0f172a');
  });

  it('should create dark theme correctly', () => {
    const theme = createAppTheme(true);

    expect(theme.palette.mode).toBe('dark');
    expect(theme.palette.primary.main).toBe('#3b82f6');
    expect(theme.palette.background.default).toBe('#121212');
    expect(theme.palette.background.paper).toBe('#1e1e1e');
    expect(theme.palette.text.primary).toBe('#ffffff');
  });

  it('should have consistent typography settings', () => {
    const lightTheme = createAppTheme(false);
    const darkTheme = createAppTheme(true);

    expect(lightTheme.typography.fontFamily).toBe(darkTheme.typography.fontFamily);
    expect(lightTheme.typography.button.textTransform).toBe('none');
    expect(darkTheme.typography.button.textTransform).toBe('none');
  });

  it('should have consistent shape settings', () => {
    const lightTheme = createAppTheme(false);
    const darkTheme = createAppTheme(true);

    expect(lightTheme.shape.borderRadius).toBe(12);
    expect(darkTheme.shape.borderRadius).toBe(12);
  });

  it('should have consistent component overrides', () => {
    const theme = createAppTheme(false);

    expect(theme.components?.MuiButton?.styleOverrides?.root?.borderRadius).toBe('8px');
    expect(theme.components?.MuiCard?.styleOverrides?.root?.borderRadius).toBe('16px');
    expect(theme.components?.MuiTableContainer?.styleOverrides?.root?.borderRadius).toBe('12px');
  });
});

describe('Layout', () => {
  it('should render children correctly', () => {
    const children = 'Test Content';
    const result = Layout({ children });
    expect(result.type).toBe('div');
    expect(result.props.children).toBe(children);
  });
});
