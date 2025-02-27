import type { SelectProps, MenuItemProps } from '@mui/material';
import { Select, MenuItem } from '@mui/material';
import { alpha, styled } from '@mui/material/styles';

export interface StyledSelectProps extends Omit<SelectProps, 'variant'> {
  glowOnFocus?: boolean;
}

const StyledMenuItem = styled(MenuItem)<MenuItemProps>(({ theme }) => {
  const isDark = theme.palette.mode === 'dark';

  return {
    minHeight: '42px',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',

    '&.Mui-selected': {
      backgroundColor: isDark
        ? alpha(theme.palette.primary.main, 0.15)
        : alpha(theme.palette.primary.main, 0.08),
      color: theme.palette.primary.main,

      '&:hover': {
        backgroundColor: isDark
          ? alpha(theme.palette.primary.main, 0.25)
          : alpha(theme.palette.primary.main, 0.12),
      },
    },

    '&:hover': {
      backgroundColor: isDark
        ? alpha(theme.palette.action.hover, 0.1)
        : alpha(theme.palette.action.hover, 0.04),
    },
  };
});

const StyledSelect = styled(Select, {
  shouldForwardProp: (prop) => prop !== 'glowOnFocus',
})<StyledSelectProps>(({ theme, glowOnFocus }) => {
  const isDark = theme.palette.mode === 'dark';

  return {
    '& .MuiSelect-select': {
      borderRadius: '12px',
      minHeight: '42px',
      display: 'flex',
      alignItems: 'center',
    },

    '& .MuiOutlinedInput-notchedOutline': {
      borderColor: isDark ? alpha(theme.palette.divider, 0.1) : theme.palette.divider,
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    },

    backgroundColor: isDark
      ? alpha(theme.palette.primary.main, 0.03)
      : alpha(theme.palette.primary.main, 0.02),
    backdropFilter: isDark ? 'blur(12px)' : 'none',
    borderRadius: '12px',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',

    '&:hover': {
      backgroundColor: isDark
        ? alpha(theme.palette.primary.main, 0.05)
        : alpha(theme.palette.primary.main, 0.03),
      '& .MuiOutlinedInput-notchedOutline': {
        borderColor: alpha(theme.palette.primary.main, isDark ? 0.2 : 0.3),
      },
    },

    '&.Mui-focused': {
      backgroundColor: isDark
        ? alpha(theme.palette.primary.main, 0.07)
        : alpha(theme.palette.primary.main, 0.04),
      '& .MuiOutlinedInput-notchedOutline': {
        borderColor: theme.palette.primary.main,
        borderWidth: '2px',
      },
      ...(glowOnFocus && {
        boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, isDark ? 0.15 : 0.1)}`,
      }),
    },

    '&.Mui-error': {
      backgroundColor: isDark
        ? alpha(theme.palette.error.main, 0.03)
        : alpha(theme.palette.error.main, 0.02),
      '&:hover': {
        backgroundColor: isDark
          ? alpha(theme.palette.error.main, 0.05)
          : alpha(theme.palette.error.main, 0.03),
      },
      '&.Mui-focused': {
        backgroundColor: isDark
          ? alpha(theme.palette.error.main, 0.07)
          : alpha(theme.palette.error.main, 0.04),
        ...(glowOnFocus && {
          boxShadow: `0 0 0 3px ${alpha(theme.palette.error.main, isDark ? 0.15 : 0.1)}`,
        }),
      },
    },

    // Small size variant
    '&.MuiInputBase-sizeSmall': {
      borderRadius: '8px',
      '& .MuiSelect-select': {
        minHeight: '36px',
        borderRadius: '8px',
      },
    },

    // Menu paper styles
    '& .MuiPaper-root': {
      borderRadius: '12px',
      marginTop: '8px',
      background: isDark
        ? `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.03)} 0%, ${alpha(
            theme.palette.primary.main,
            0,
          )} 100%)`
        : theme.palette.background.paper,
      backdropFilter: isDark ? 'blur(12px)' : 'none',
      border: `1px solid ${isDark ? alpha(theme.palette.divider, 0.1) : theme.palette.divider}`,
      boxShadow: isDark
        ? '0 8px 16px -4px rgba(0, 0, 0, 0.3)'
        : '0 8px 16px -4px rgba(0, 0, 0, 0.1)',
    },
  };
});

export { StyledMenuItem };
export default StyledSelect;
