import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Alert, AlertContent, AlertDescription, AlertTitle } from './alert';

describe('Alert', () => {
  it('renders with default variant', () => {
    render(<Alert>Alert content</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveClass('bg-background');
  });

  it('renders with destructive variant', () => {
    render(<Alert variant="destructive">Error alert</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('border-destructive/50', 'text-destructive');
  });

  it('renders with warning variant', () => {
    render(<Alert variant="warning">Warning alert</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('border-amber-200', 'bg-amber-50');
  });

  it('renders with success variant', () => {
    render(<Alert variant="success">Success alert</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('border-emerald-200', 'bg-emerald-50');
  });

  it('renders with info variant', () => {
    render(<Alert variant="info">Info alert</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('border-blue-200', 'bg-blue-50');
  });

  it('applies custom className', () => {
    render(<Alert className="custom-alert">Custom</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('custom-alert');
  });
});

describe('AlertTitle', () => {
  it('renders title correctly', () => {
    render(<AlertTitle>Alert Title</AlertTitle>);
    const title = screen.getByText('Alert Title');
    expect(title).toBeInTheDocument();
    expect(title.tagName).toBe('H5');
  });

  it('applies correct styles', () => {
    render(<AlertTitle>Title</AlertTitle>);
    const title = screen.getByText('Title');
    expect(title).toHaveClass('mb-1', 'font-medium');
  });

  it('applies custom className', () => {
    render(<AlertTitle className="custom-title">Title</AlertTitle>);
    const title = screen.getByText('Title');
    expect(title).toHaveClass('custom-title');
  });
});

describe('AlertDescription', () => {
  it('renders description correctly', () => {
    render(<AlertDescription>Alert description</AlertDescription>);
    const description = screen.getByText('Alert description');
    expect(description).toBeInTheDocument();
  });

  it('applies correct styles', () => {
    render(<AlertDescription>Description</AlertDescription>);
    const description = screen.getByText('Description');
    expect(description).toHaveClass('text-sm');
  });

  it('applies custom className', () => {
    render(<AlertDescription className="custom-desc">Description</AlertDescription>);
    const description = screen.getByText('Description');
    expect(description).toHaveClass('custom-desc');
  });
});

describe('AlertContent', () => {
  it('renders content correctly', () => {
    render(<AlertContent>Content wrapper</AlertContent>);
    const content = screen.getByText('Content wrapper');
    expect(content).toBeInTheDocument();
  });

  it('applies flex-1 class', () => {
    render(<AlertContent>Content</AlertContent>);
    const content = screen.getByText('Content');
    expect(content).toHaveClass('flex-1');
  });

  it('applies custom className', () => {
    render(<AlertContent className="custom-content">Content</AlertContent>);
    const content = screen.getByText('Content');
    expect(content).toHaveClass('custom-content');
  });
});

describe('Alert composition', () => {
  it('renders complete alert with title and description', () => {
    render(
      <Alert variant="warning">
        <AlertTitle>Warning</AlertTitle>
        <AlertDescription>This is a warning message</AlertDescription>
      </Alert>,
    );

    const alert = screen.getByRole('alert');
    const title = screen.getByText('Warning');
    const description = screen.getByText('This is a warning message');

    expect(alert).toBeInTheDocument();
    expect(title).toBeInTheDocument();
    expect(description).toBeInTheDocument();
  });

  it('renders complete alert with AlertContent wrapper', () => {
    render(
      <Alert variant="info">
        <AlertContent>
          <AlertTitle>Info</AlertTitle>
          <AlertDescription>This is an info message</AlertDescription>
        </AlertContent>
      </Alert>,
    );

    const alert = screen.getByRole('alert');
    const title = screen.getByText('Info');
    const description = screen.getByText('This is an info message');

    expect(alert).toBeInTheDocument();
    expect(title).toBeInTheDocument();
    expect(description).toBeInTheDocument();
  });
});
