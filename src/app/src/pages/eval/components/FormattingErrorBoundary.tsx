import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  showErrorDetails?: boolean;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class FormattingErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('FormattingErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Alert severity="error" sx={{ mb: 2 }}>
          <AlertTitle>Content Formatting Error</AlertTitle>
          <Typography variant="body2" sx={{ mb: 1 }}>
            There was an error formatting this content. The raw content may still be viewable.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
            <Button size="small" variant="outlined" onClick={this.handleRetry}>
              Retry
            </Button>
          </Box>
          {this.props.showErrorDetails && this.state.error && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                {this.state.error.message}
              </Typography>
            </Box>
          )}
        </Alert>
      );
    }

    return this.props.children;
  }
}