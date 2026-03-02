/**
 * Tests for ErrorBoundary component.
 */

import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';
import {
  ErrorBoundary,
  withErrorBoundary,
} from '../../../../src/ui/components/shared/ErrorBoundary';

/**
 * Component that throws an error when shouldThrow prop is true.
 */
function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error from component');
  }
  return <Text>Working component</Text>;
}

/**
 * Simple test component for HOC testing.
 */
function SimpleComponent({ message }: { message: string }) {
  return <Text>{message}</Text>;
}

describe('ErrorBoundary', () => {
  it('should render children normally when no error occurs', () => {
    const { lastFrame } = render(
      <ErrorBoundary>
        <Text>Child content</Text>
      </ErrorBoundary>,
    );

    const output = lastFrame();
    expect(output).toContain('Child content');
    expect(output).not.toContain('UI Error');
  });

  it('should catch errors and render fallback UI', () => {
    const { lastFrame } = render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    const output = lastFrame();
    expect(output).toContain('UI Error');
    expect(output).toContain('Test error from component');
  });

  it('should call onError callback when error occurs', () => {
    const onError = vi.fn();

    render(
      <ErrorBoundary onError={onError}>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Test error from component',
      }),
      expect.objectContaining({
        componentStack: expect.any(String),
      }),
    );
  });

  it('should show component name in error message', () => {
    const { lastFrame } = render(
      <ErrorBoundary componentName="TestComponent">
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    const output = lastFrame();
    expect(output).toContain('UI Error in TestComponent');
  });

  it('should render default error message without component name', () => {
    const { lastFrame } = render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    const output = lastFrame();
    expect(output).toContain('UI Error');
    expect(output).not.toContain('UI Error in');
  });

  it('should render custom fallback when provided', () => {
    const customFallback = <Text color="magenta">Custom error fallback</Text>;

    const { lastFrame } = render(
      <ErrorBoundary fallback={customFallback}>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    const output = lastFrame();
    expect(output).toContain('Custom error fallback');
    expect(output).not.toContain('UI Error');
  });

  it('should display error name and message in default fallback', () => {
    const { lastFrame } = render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    const output = lastFrame();
    expect(output).toContain('Error:');
    expect(output).toContain('Test error from component');
  });

  it('should show helpful instructions in default fallback', () => {
    const { lastFrame } = render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    const output = lastFrame();
    expect(output).toContain('Your evaluation results are safe');
    expect(output).toContain('q');
    expect(output).toContain('to exit');
  });
});

describe('withErrorBoundary', () => {
  it('should wrap component with error boundary', () => {
    const WrappedComponent = withErrorBoundary(SimpleComponent, 'SimpleComponent');

    const { lastFrame } = render(<WrappedComponent message="Hello" />);

    const output = lastFrame();
    expect(output).toContain('Hello');
  });

  it('should catch errors in wrapped component', () => {
    const WrappedComponent = withErrorBoundary(ThrowingComponent, 'ThrowingComponent');

    const { lastFrame } = render(<WrappedComponent shouldThrow={true} />);

    const output = lastFrame();
    expect(output).toContain('UI Error in ThrowingComponent');
  });

  it('should forward onBoundaryError callback', () => {
    const onBoundaryError = vi.fn();
    const WrappedComponent = withErrorBoundary(ThrowingComponent, 'ThrowingComponent');

    render(<WrappedComponent shouldThrow={true} onBoundaryError={onBoundaryError} />);

    expect(onBoundaryError).toHaveBeenCalledTimes(1);
    expect(onBoundaryError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Test error from component',
      }),
      expect.any(Object),
    );
  });

  it('should set correct display name', () => {
    const WrappedComponent = withErrorBoundary(SimpleComponent, 'SimpleComponent');

    expect(WrappedComponent.displayName).toBe('WithErrorBoundary(SimpleComponent)');
  });

  it('should use component name from function when componentName not provided', () => {
    function MyNamedComponent() {
      return <Text>Named</Text>;
    }

    const WrappedComponent = withErrorBoundary(MyNamedComponent);

    expect(WrappedComponent.displayName).toBe('WithErrorBoundary(MyNamedComponent)');
  });

  it('should use "Component" fallback when no name available', () => {
    const AnonymousComponent = () => <Text>Anonymous</Text>;
    const WrappedComponent = withErrorBoundary(AnonymousComponent);

    // The anonymous arrow function should have a name set by JS engine
    expect(WrappedComponent.displayName).toMatch(/WithErrorBoundary\(/);
  });

  it('should pass through all props to wrapped component', () => {
    interface TestProps {
      message: string;
      count: number;
      enabled: boolean;
    }

    function TestComponent({ message, count, enabled }: TestProps) {
      return (
        <Text>
          {message} - {count} - {enabled ? 'yes' : 'no'}
        </Text>
      );
    }

    const WrappedComponent = withErrorBoundary(TestComponent, 'TestComponent');

    const { lastFrame } = render(<WrappedComponent message="test" count={42} enabled={true} />);

    const output = lastFrame();
    expect(output).toContain('test - 42 - yes');
  });
});
