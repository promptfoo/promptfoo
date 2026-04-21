import type { ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { ErrorBoundary } from 'react-error-boundary';

function MediaErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: unknown;
  resetErrorBoundary: (...args: unknown[]) => void;
}) {
  const message =
    error instanceof Error ? error.message : 'An error occurred while loading media content.';
  return (
    <div className="flex items-center justify-center p-8">
      <Alert variant="destructive" className="max-w-md">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Something went wrong</AlertTitle>
        <AlertDescription className="mt-2">
          <p className="text-sm mb-4">{message}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => resetErrorBoundary()}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}

export function MediaErrorBoundary({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return (
    <ErrorBoundary
      fallbackRender={
        fallback == null ? (props) => <MediaErrorFallback {...props} /> : () => fallback
      }
      onError={(error, info) => {
        console.error('[MediaErrorBoundary] Caught error:', error, info);
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
