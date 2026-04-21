import React from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StoreErrorBoundary } from './StoreErrorBoundary';

// Component that throws an error
function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error message');
  }
  return <div>Content rendered successfully</div>;
}

describe('StoreErrorBoundary', () => {
  // Suppress console.error for error boundary tests
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });
  afterEach(() => {
    console.error = originalError;
  });

  it('renders children when there is no error', () => {
    render(
      <StoreErrorBoundary>
        <div>Test content</div>
      </StoreErrorBoundary>,
    );

    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('renders error UI when child throws', () => {
    render(
      <StoreErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </StoreErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText(/couldn't load the store/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('recovers when Try Again is clicked', async () => {
    const user = userEvent.setup();

    // Start with throwing state
    const { rerender } = render(
      <StoreErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </StoreErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Change to non-throwing state before clicking retry
    rerender(
      <StoreErrorBoundary>
        <ThrowingComponent shouldThrow={false} />
      </StoreErrorBoundary>,
    );

    // Click retry button
    await user.click(screen.getByRole('button', { name: /try again/i }));

    // Should now render the content
    expect(screen.getByText('Content rendered successfully')).toBeInTheDocument();
  });

  it('logs error to console', () => {
    render(
      <StoreErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </StoreErrorBoundary>,
    );

    expect(console.error).toHaveBeenCalledWith(
      '[Store] Error caught by boundary:',
      expect.any(Error),
      expect.objectContaining({ componentStack: expect.any(String) }),
    );
  });
});
