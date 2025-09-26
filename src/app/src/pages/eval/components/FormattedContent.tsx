import React from 'react';
import Typography from '@mui/material/Typography';
import { formatTextContent } from '../utils/formatting';
import { useFormatting } from '../contexts/FormattingContext';
import { FormattingErrorBoundary } from './FormattingErrorBoundary';

interface FormattedContentProps {
  content: string;
  variant?: 'body1' | 'body2' | 'caption';
  sx?: any;
  fallback?: React.ReactNode;
}

export function FormattedContent({
  content,
  variant = 'body1',
  sx = {},
  fallback
}: FormattedContentProps) {
  const settings = useFormatting();

  if (!content) {
    return null;
  }

  return (
    <FormattingErrorBoundary
      fallback={
        fallback || (
          <Typography variant={variant} sx={sx} style={{ wordBreak: settings.wordBreak }}>
            {content}
          </Typography>
        )
      }
    >
      <Typography variant={variant} sx={sx}>
        {formatTextContent(content, settings)}
      </Typography>
    </FormattingErrorBoundary>
  );
}