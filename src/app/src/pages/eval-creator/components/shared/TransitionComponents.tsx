import React from 'react';
import Box from '@mui/material/Box';
import type { ButtonProps } from '@mui/material/Button';
import Button from '@mui/material/Button';
import type { IconButtonProps } from '@mui/material/IconButton';
import IconButton from '@mui/material/IconButton';
import type { PaperProps } from '@mui/material/Paper';
import Paper from '@mui/material/Paper';
import type { StackProps } from '@mui/material/Stack';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import type { TypographyProps } from '@mui/material/Typography';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

// Common transition properties for UI elements
export const getTransitionProps = (properties: string[] = ['all']) => {
  const theme = useTheme();
  return {
    transition: theme.transitions.create(properties, {
      duration: theme.transitions.duration.standard,
    }),
  };
};

// TransitionPaper - A Paper component with built-in theme transitions
export const TransitionPaper: React.FC<PaperProps> = ({
  children,
  sx,
  elevation = 0,
  ...props
}) => {
  const theme = useTheme();

  return (
    <Paper
      elevation={elevation}
      sx={{
        p: 3,
        borderRadius: 2,
        border: `1px solid ${theme.palette.divider}`,
        transition: theme.transitions.create(['background-color', 'box-shadow', 'border-color'], {
          duration: theme.transitions.duration.standard,
        }),
        ...sx,
      }}
      {...props}
    >
      {children}
    </Paper>
  );
};

// TransitionBox - A Box component with built-in theme transitions
export const TransitionBox: React.FC<React.ComponentProps<typeof Box>> = ({
  children,
  sx,
  ...props
}) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        transition: theme.transitions.create(['background-color', 'color', 'border-color'], {
          duration: theme.transitions.duration.standard,
        }),
        ...sx,
      }}
      {...props}
    >
      {children}
    </Box>
  );
};

// TransitionTypography - Typography with smooth theme transitions
export const TransitionTypography: React.FC<TypographyProps> = ({ children, sx, ...props }) => {
  const theme = useTheme();

  return (
    <Typography
      sx={{
        transition: theme.transitions.create('color', {
          duration: theme.transitions.duration.standard,
        }),
        ...sx,
      }}
      {...props}
    >
      {children}
    </Typography>
  );
};

// SectionTitle - Consistent section title component
export const SectionTitle: React.FC<TypographyProps> = ({
  children,
  variant = 'h5',
  sx,
  ...props
}) => {
  const theme = useTheme();

  return (
    <Typography
      variant={variant}
      sx={{
        fontWeight: 600,
        mb: 2,
        transition: theme.transitions.create('color', {
          duration: theme.transitions.duration.standard,
        }),
        ...sx,
      }}
      {...props}
    >
      {children}
    </Typography>
  );
};

// TransitionButton - Button with built-in transitions
export const TransitionButton: React.FC<ButtonProps> = ({
  children,
  sx,
  variant = 'contained',
  ...props
}) => {
  const theme = useTheme();

  return (
    <Button
      variant={variant}
      sx={{
        transition: theme.transitions.create(
          ['background-color', 'box-shadow', 'border-color', 'color', 'transform'],
          { duration: theme.transitions.duration.standard },
        ),
        '&:hover': {
          transform: variant === 'contained' ? 'translateY(-1px)' : undefined,
          ...sx?.['&:hover'],
        },
        ...sx,
      }}
      {...props}
    >
      {children}
    </Button>
  );
};

// TransitionIconButton - IconButton with built-in transitions
export const TransitionIconButton: React.FC<IconButtonProps & { tooltip?: string }> = ({
  children,
  sx,
  tooltip,
  ...props
}) => {
  const theme = useTheme();

  const button = (
    <IconButton
      size="small"
      sx={{
        transition: theme.transitions.create(['background-color', 'color', 'transform'], {
          duration: theme.transitions.duration.shortest,
        }),
        ...sx,
      }}
      {...props}
    >
      {children}
    </IconButton>
  );

  if (tooltip) {
    return <Tooltip title={tooltip}>{button}</Tooltip>;
  }

  return button;
};

// ActionButtonsStack - Stack for action buttons with consistent spacing
export const ActionButtonsStack: React.FC<StackProps> = ({
  children,
  sx,
  direction = { xs: 'column', sm: 'row' },
  spacing = 1,
  ...props
}) => {
  return (
    <Stack
      direction={direction}
      spacing={spacing}
      alignItems="center"
      sx={{
        ...sx,
      }}
      {...props}
    >
      {children}
    </Stack>
  );
};

// ContentSection - Container for content sections with consistent styling
export const ContentSection: React.FC<PaperProps> = ({ children, sx, ...props }) => {
  const theme = useTheme();

  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        mb: 3,
        borderRadius: 2,
        border: `1px solid ${theme.palette.divider}`,
        transition: theme.transitions.create(['background-color', 'border-color'], {
          duration: theme.transitions.duration.standard,
        }),
        ...sx,
      }}
      {...props}
    >
      {children}
    </Paper>
  );
};

// TableContainer with consistent styling
export const StyledTableContainer: React.FC<PaperProps> = ({ children, sx, ...props }) => {
  const theme = useTheme();

  return (
    <Paper
      elevation={1}
      sx={{
        borderRadius: 2,
        overflow: 'hidden',
        transition: theme.transitions.create(['background-color', 'box-shadow', 'border-color'], {
          duration: theme.transitions.duration.standard,
        }),
        ...sx,
      }}
      {...props}
    >
      {children}
    </Paper>
  );
};

// EmptyState - Reusable empty state component
interface EmptyStateProps {
  message: string;
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ message, icon }) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        py: 4,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
      }}
    >
      {icon}
      <Typography
        variant="body1"
        color="text.secondary"
        sx={{
          transition: theme.transitions.create('color', {
            duration: theme.transitions.duration.standard,
          }),
        }}
      >
        {message}
      </Typography>
    </Box>
  );
};
