import React from 'react';
import { Alert, Box, Button, Collapse, Typography } from '@mui/material';

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

      const isDev = process.env.NODE_ENV === 'development';

      return (
        <Box sx={{ p: 2, maxWidth: '100%' }}>
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={this.handleReload}>
                Reload Page
              </Button>
            }
          >
            <Typography variant="subtitle1" gutterBottom>
              Something went wrong {this.props.name ? `in ${this.props.name}` : ''}.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Please try reloading the page.
            </Typography>
          </Alert>

          {isDev && (
            <Box sx={{ mt: 2 }}>
              <Button size="small" variant="outlined" onClick={this.toggleDetails} sx={{ mb: 1 }}>
                {this.state.showDetails ? 'Hide' : 'Show'} Error Details
              </Button>
              <Collapse in={this.state.showDetails}>
                <Box
                  sx={{
                    mt: 1,
                    p: 2,
                    bgcolor: 'grey.100',
                    borderRadius: 1,
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                    overflow: 'auto',
                  }}
                >
                  <Typography variant="h6" gutterBottom>
                    Error Details:
                  </Typography>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                    {this.state.error?.name}: {this.state.error?.message}
                  </pre>
                  {this.state.error?.stack && (
                    <>
                      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                        Stack Trace:
                      </Typography>
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                        {this.state.error.stack}
                      </pre>
                    </>
                  )}
                  {this.state.errorInfo && (
                    <>
                      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                        Component Stack:
                      </Typography>
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </>
                  )}
                </Box>
              </Collapse>
            </Box>
          )}
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
