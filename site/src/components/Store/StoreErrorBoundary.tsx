import React, { Component } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary for the store page.
 * Catches rendering errors and displays a fallback UI instead of crashing.
 */
export class StoreErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log error for debugging (could send to error tracking service)
    console.error('[Store] Error caught by boundary:', error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '50vh',
            textAlign: 'center',
            px: 3,
            gap: 2,
          }}
        >
          <Typography variant="h5" sx={{ fontWeight: 600, color: 'text.primary' }}>
            Something went wrong
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary', maxWidth: 400 }}>
            We couldn't load the store. This might be a temporary issue.
          </Typography>
          <Button
            variant="contained"
            onClick={this.handleRetry}
            sx={{
              mt: 2,
              backgroundColor: '#1a1a2e',
              '&:hover': {
                backgroundColor: '#2a2a4e',
              },
            }}
          >
            Try Again
          </Button>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <Box
              component="pre"
              sx={{
                mt: 3,
                p: 2,
                backgroundColor: '#f5f5f5',
                borderRadius: 1,
                fontSize: '0.75rem',
                maxWidth: '100%',
                overflow: 'auto',
                textAlign: 'left',
              }}
            >
              {this.state.error.message}
              {'\n\n'}
              {this.state.error.stack}
            </Box>
          )}
        </Box>
      );
    }

    return this.props.children;
  }
}
