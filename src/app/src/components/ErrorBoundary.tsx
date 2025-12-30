import React from 'react';

import { AlertCircle, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';

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
            <AlertCircle className="h-4 w-4" />
            <div className="flex-1">
              <AlertTitle>
                Something went wrong{this.props.name ? ` in ${this.props.name}` : ''}.
              </AlertTitle>
              <AlertDescription>Please try reloading the page.</AlertDescription>
            </div>
            <Button variant="outline" size="sm" onClick={this.handleReload} className="shrink-0">
              <RefreshCw className="h-3 w-3 mr-1" />
              Reload Page
            </Button>
          </Alert>

          {isDev && (
            <Collapsible open={this.state.showDetails} onOpenChange={this.toggleDetails}>
              <div className="mt-4">
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm">
                    {this.state.showDetails ? (
                      <ChevronUp className="h-3 w-3 mr-1" />
                    ) : (
                      <ChevronDown className="h-3 w-3 mr-1" />
                    )}
                    {this.state.showDetails ? 'Hide' : 'Show'} Error Details
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-3 p-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg font-mono text-sm overflow-auto text-foreground">
                    <h6 className="text-base font-semibold mb-2">Error Details:</h6>
                    <pre className="m-0 whitespace-pre-wrap text-red-700 dark:text-red-400">
                      {this.state.error?.name}: {this.state.error?.message}
                    </pre>
                    {this.state.error?.stack && (
                      <>
                        <h6 className="text-base font-semibold mb-2 mt-4">Stack Trace:</h6>
                        <pre className="m-0 whitespace-pre-wrap text-muted-foreground">
                          {this.state.error.stack}
                        </pre>
                      </>
                    )}
                    {this.state.errorInfo && (
                      <>
                        <h6 className="text-base font-semibold mb-2 mt-4">Component Stack:</h6>
                        <pre className="m-0 whitespace-pre-wrap text-muted-foreground">
                          {this.state.errorInfo.componentStack}
                        </pre>
                      </>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
