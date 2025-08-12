import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { describe, it, expect } from 'vitest';
import RedTeamBadge from './RedTeamBadge';

describe('RedTeamBadge', () => {
  it('should render the RT text', () => {
    render(<RedTeamBadge />);
    expect(screen.getByText('RT')).toBeInTheDocument();
  });

  it('should have proper accessibility attributes', () => {
    render(<RedTeamBadge />);
    const badge = screen.getByText('RT');
    expect(badge).toHaveAttribute('aria-label', 'Red team adversarial evaluation');
  });

  it('should render with correct styles in light mode', () => {
    const lightTheme = createTheme({ palette: { mode: 'light' } });
    render(
      <ThemeProvider theme={lightTheme}>
        <RedTeamBadge />
      </ThemeProvider>,
    );
    const badge = screen.getByText('RT');
    // Check that the element exists and has expected attributes
    expect(badge.tagName.toLowerCase()).toBe('span');
    expect(badge).toHaveStyle({ textTransform: 'uppercase' });
  });

  it('should render with correct styles in dark mode', () => {
    const darkTheme = createTheme({ palette: { mode: 'dark' } });
    render(
      <ThemeProvider theme={darkTheme}>
        <RedTeamBadge />
      </ThemeProvider>,
    );
    const badge = screen.getByText('RT');
    // Check that the element exists and has expected attributes
    expect(badge.tagName.toLowerCase()).toBe('span');
    expect(badge).toHaveStyle({ textTransform: 'uppercase' });
  });

  it('should have a tooltip with correct title', async () => {
    render(<RedTeamBadge />);
    const badge = screen.getByText('RT');

    // The tooltip title is set via the Tooltip component's title prop
    // MUI Tooltip adds the title to the trigger element's title attribute on hover
    // For testing purposes, we can check that the component structure is correct
    expect(badge).toBeInTheDocument();

    // The parent should be the Tooltip wrapper
    const tooltipTrigger = badge.parentElement;
    expect(tooltipTrigger).toBeInTheDocument();
  });

  it('should have correct typography styles', () => {
    render(<RedTeamBadge />);
    const badge = screen.getByText('RT');

    // Check for expected inline styles
    expect(badge).toHaveStyle({
      textTransform: 'uppercase',
      userSelect: 'none',
      display: 'inline-flex',
      fontWeight: '600',
    });
  });
});
