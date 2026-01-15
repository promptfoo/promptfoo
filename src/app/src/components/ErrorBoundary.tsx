import React from 'react';

import { Alert, AlertContent, AlertDescription, AlertTitle } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import { cn } from '@app/lib/utils';
import { AlertCircle, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  name?: string; // Name of the component/page being wrapped
  fallback?: React.ReactNode; // Optional custom fallback UI
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  showDetails: boolean;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo });

    // Log to console
    console.error(`Error in ${this.props.name || 'component'}:`, {
      error,
      componentStack: errorInfo.componentStack,
    });
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private toggleDetails = (): void => {
    this.setState((prevState) => ({ showDetails: !prevState.showDetails }));
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isDev = import.meta.env.DEV;

      return (
        <div className="p-4 max-w-full">
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertContent>
              <AlertTitle>
                Something went wrong {this.props.name ? `in ${this.props.name}` : ''}.
              </AlertTitle>
              <AlertDescription className="text-muted-foreground">
                Please try reloading the page.
              </AlertDescription>
            </AlertContent>
            <Button
              variant="outline"
              size="sm"
              onClick={this.handleReload}
              className="shrink-0 gap-1"
            >
              <RefreshCw className="size-3" />
              Reload Page
            </Button>
          </Alert>

          {isDev && (
            <div className="mt-4">
              <Collapsible open={this.state.showDetails} onOpenChange={this.toggleDetails}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" className="mb-2 gap-1">
                    {this.state.showDetails ? (
                      <>
                        <ChevronUp className="size-4" />
                        Hide Error Details
                      </>
                    ) : (
                      <>
                        <ChevronDown className="size-4" />
                        Show Error Details
                      </>
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div
                    className={cn(
                      'mt-2 p-4 rounded-md font-mono text-sm overflow-auto',
                      'bg-zinc-100 dark:bg-zinc-900',
                    )}
                  >
                    <h6 className="text-base font-semibold mb-2">Error Details:</h6>
                    <pre className="m-0 whitespace-pre-wrap text-red-700 dark:text-red-400">
                      {this.state.error?.name}: {this.state.error?.message}
                    </pre>
                    {this.state.error?.stack && (
                      <>
                        <h6 className="text-base font-semibold mt-4 mb-2">Stack Trace:</h6>
                        <pre className="m-0 whitespace-pre-wrap text-muted-foreground">
                          {this.state.error.stack}
                        </pre>
                      </>
                    )}
                    {this.state.errorInfo && (
                      <>
                        <h6 className="text-base font-semibold mt-4 mb-2">Component Stack:</h6>
                        <pre className="m-0 whitespace-pre-wrap text-muted-foreground">
                          {this.state.errorInfo.componentStack}
                        </pre>
                      </>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
