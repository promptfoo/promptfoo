import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './badge';

describe('Badge', () => {
  it('renders with default variant', () => {
    render(<Badge>Default</Badge>);
    const badge = screen.getByText('Default');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-primary');
  });

  it('renders with secondary variant', () => {
    render(<Badge variant="secondary">Secondary</Badge>);
    const badge = screen.getByText('Secondary');
    expect(badge).toHaveClass('bg-muted');
  });

  it('renders with destructive variant', () => {
    render(<Badge variant="destructive">Error</Badge>);
    const badge = screen.getByText('Error');
    expect(badge).toHaveClass('bg-destructive');
  });

  it('renders with outline variant', () => {
    render(<Badge variant="outline">Outline</Badge>);
    const badge = screen.getByText('Outline');
    expect(badge).toHaveClass('border-border');
  });

  it('renders with critical severity variant', () => {
    render(<Badge variant="critical">Critical</Badge>);
    const badge = screen.getByText('Critical');
    expect(badge).toHaveClass('bg-red-100', 'text-red-700');
  });

  it('renders with high severity variant', () => {
    render(<Badge variant="high">High</Badge>);
    const badge = screen.getByText('High');
    expect(badge).toHaveClass('bg-red-100', 'text-red-600');
  });

  it('renders with medium severity variant', () => {
    render(<Badge variant="medium">Medium</Badge>);
    const badge = screen.getByText('Medium');
    expect(badge).toHaveClass('bg-amber-100', 'text-amber-700');
  });

  it('renders with low severity variant', () => {
    render(<Badge variant="low">Low</Badge>);
    const badge = screen.getByText('Low');
    expect(badge).toHaveClass('bg-emerald-100', 'text-emerald-700');
  });

  it('renders with info variant', () => {
    render(<Badge variant="info">Info</Badge>);
    const badge = screen.getByText('Info');
    expect(badge).toHaveClass('bg-blue-100', 'text-blue-700');
  });

  it('renders with success variant', () => {
    render(<Badge variant="success">Success</Badge>);
    const badge = screen.getByText('Success');
    expect(badge).toHaveClass('bg-emerald-100', 'text-emerald-700');
  });

  it('renders with warning variant', () => {
    render(<Badge variant="warning">Warning</Badge>);
    const badge = screen.getByText('Warning');
    expect(badge).toHaveClass('bg-amber-100', 'text-amber-700');
  });

  it('applies custom className', () => {
    render(<Badge className="custom-badge">Custom</Badge>);
    const badge = screen.getByText('Custom');
    expect(badge).toHaveClass('custom-badge');
  });

  it('renders with children elements', () => {
    render(
      <Badge>
        <span>Icon</span> Text
      </Badge>,
    );
    const badge = screen.getByText(/Icon/);
    expect(badge).toBeInTheDocument();
  });
});
