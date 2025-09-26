import React from 'react';

import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  variant?: 'outlined' | 'elevation';
  size?: 'small' | 'medium' | 'large';
}

export default function EmptyState({
  icon,
  title,
  description,
  variant = 'outlined',
  size = 'medium',
}: EmptyStateProps) {
  const padding = size === 'small' ? 2 : size === 'large' ? 4 : 3;
  const iconSize = size === 'small' ? 32 : size === 'large' ? 64 : 48;

  return (
    <Paper variant={variant} sx={{ p: padding }}>
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        sx={{ color: 'text.secondary' }}
      >
        <Box sx={{ fontSize: iconSize, mb: 1, opacity: 0.5 }}>
          {icon}
        </Box>
        <Typography variant="body1" color="text.secondary" align="center">
          {title}
        </Typography>
        {description && (
          <Typography variant="body2" color="text.disabled" align="center" sx={{ mt: 0.5 }}>
            {description}
          </Typography>
        )}
      </Box>
    </Paper>
  );
}