/**
 * ErrorBoundary - Catches React errors and displays fallback UI.
 *
 * Prevents the entire CLI UI from crashing when a component throws.
 * Must be a class component because error boundaries require
 * getDerivedStateFromError and componentDidCatch lifecycle methods.
 */

import { Box, Text } from 'ink';
import React, { Component, type ReactNode } from 'react';
import logger from '../../../logger';

export interface ErrorBoundaryProps {
  /** Child components to render */
  children: ReactNode;
  /** Optional custom fallback UI */
  fallback?: ReactNode;
  /** Callback when error is caught */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** Component name for error context */
  componentName?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Default fallback UI shown when an error occurs.
 */
function DefaultFallback({
  error,
  componentName,
}: {
  error: Error | null;
  componentName?: string;
}) {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="red" padding={1}>
      <Box marginBottom={1}>
        <Text color="red" bold>
          UI Error {componentName ? `in ${componentName}` : ''}
        </Text>
      </Box>

      {error && (
        <Box flexDirection="column">
          <Text color="yellow">{error.name}: </Text>
          <Text>{error.message}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          The UI encountered an error. Your evaluation results are safe.
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Press </Text>
        <Text color="cyan">q</Text>
        <Text dimColor> to exit or check the logs for details.</Text>
      </Box>
    </Box>
  );
}

/**
 * Error boundary component that catches errors in child components.
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary componentName="EvalScreen" onError={handleError}>
 *   <EvalScreen {...props} />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Update state so next render shows fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log error details
    logger.error(`[ErrorBoundary] UI error caught${this.props.componentName ? ` in ${this.props.componentName}` : ''}`, {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });

    // Update state with error info
    this.setState({ errorInfo });

    // Call optional error callback
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // Render custom fallback or default
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <DefaultFallback
          error={this.state.error}
          componentName={this.props.componentName}
        />
      );
    }

    return this.props.children;
  }
}

/**
 * Higher-order component to wrap any component with error boundary.
 *
 * Usage:
 * ```tsx
 * const SafeComponent = withErrorBoundary(MyComponent, 'MyComponent');
 * ```
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  componentName?: string,
): React.FC<P & { onBoundaryError?: (error: Error, errorInfo: React.ErrorInfo) => void }> {
  const WithErrorBoundary: React.FC<P & { onBoundaryError?: (error: Error, errorInfo: React.ErrorInfo) => void }> = (props) => {
    const { onBoundaryError, ...rest } = props;
    return (
      <ErrorBoundary componentName={componentName} onError={onBoundaryError}>
        <WrappedComponent {...(rest as P)} />
      </ErrorBoundary>
    );
  };

  WithErrorBoundary.displayName = `WithErrorBoundary(${componentName || WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;

  return WithErrorBoundary;
}

export default ErrorBoundary;
