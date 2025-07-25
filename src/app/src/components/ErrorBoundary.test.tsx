import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ErrorBoundary from './ErrorBoundary';

describe('ErrorBoundary', () => {
  describe('render', () => {
    it('should render `this.props.children` when `this.state.hasError` is false', () => {
      const childText = 'I am a child component';

      render(
        <ErrorBoundary>
          <div>{childText}</div>
        </ErrorBoundary>,
      );

      expect(screen.getByText(childText)).toBeInTheDocument();

      expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
    });

    it('should render `this.props.fallback` when `this.state.hasError` is true and `this.props.fallback` is provided', () => {
      const fallbackText = 'Custom Fallback UI';
      const FallbackComponent = () => <div>{fallbackText}</div>;
      const childText = 'I am a child component';

      const ErrorComponent = () => {
        throw new Error('Test error');
        return null;
      };

      const { rerender } = render(
        <ErrorBoundary fallback={<FallbackComponent />}>
          <div>{childText}</div>
        </ErrorBoundary>,
      );

      rerender(
        <ErrorBoundary fallback={<FallbackComponent />}>
          <ErrorComponent />
        </ErrorBoundary>,
      );

      expect(screen.getByText(fallbackText)).toBeInTheDocument();

      expect(screen.queryByText(childText)).not.toBeInTheDocument();
    });

    it('should render the default error UI with error details toggle when this.state.hasError is true, this.props.fallback is not provided, and import.meta.env.DEV is true', () => {
      vi.stubGlobal('import.meta', { env: { DEV: true } });

      const ErrorThrowingComponent = () => {
        throw new Error('Test Error');
        return null;
      };

      render(
        <ErrorBoundary>
          <ErrorThrowingComponent />
        </ErrorBoundary>,
      );

      expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
      expect(screen.getByText(/Show Error Details/i)).toBeInTheDocument();
    });

    it('should display the correct error message when this.props.name is an empty string', () => {
      const ThrowError = () => {
        throw new Error('Test error');
      };

      render(
        <ErrorBoundary name="">
          <ThrowError />
        </ErrorBoundary>,
      );

      const errorMessage = screen.getByText(/Something went wrong/i);
      expect(errorMessage).toBeInTheDocument();
      expect(errorMessage).not.toHaveTextContent('in .');
    });
  });
});
