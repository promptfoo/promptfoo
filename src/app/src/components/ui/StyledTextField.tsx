import type { TextFieldProps } from '@mui/material';
import { TextField } from '@mui/material';
import { alpha, styled } from '@mui/material/styles';

export interface StyledTextFieldProps extends Omit<TextFieldProps, 'variant'> {
  glowOnFocus?: boolean;
}

const StyledTextField = styled(TextField, {
  shouldForwardProp: (prop) => prop !== 'glowOnFocus',
})<StyledTextFieldProps>(({ theme, glowOnFocus }) => {
  const isDark = theme.palette.mode === 'dark';

  return {
    '& .MuiOutlinedInput-root': {
      borderRadius: '12px',
      backgroundColor: isDark
        ? alpha(theme.palette.primary.main, 0.03)
        : alpha(theme.palette.primary.main, 0.02),
      backdropFilter: isDark ? 'blur(12px)' : 'none',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',

      '& fieldset': {
        borderColor: isDark ? alpha(theme.palette.divider, 0.1) : theme.palette.divider,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      },

      '&:hover': {
        backgroundColor: isDark
          ? alpha(theme.palette.primary.main, 0.05)
          : alpha(theme.palette.primary.main, 0.03),
        '& fieldset': {
          borderColor: alpha(theme.palette.primary.main, isDark ? 0.2 : 0.3),
        },
      },

      '&.Mui-focused': {
        backgroundColor: isDark
          ? alpha(theme.palette.primary.main, 0.07)
          : alpha(theme.palette.primary.main, 0.04),
        '& fieldset': {
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
    },

    '& .MuiInputLabel-root': {
      '&.Mui-focused': {
        color: theme.palette.primary.main,
      },
      '&.Mui-error': {
        color: theme.palette.error.main,
      },
    },

    // Multiline styles
    '& .MuiOutlinedInput-root.MuiInputBase-multiline': {
      padding: theme.spacing(1.5),
    },

    // Small size variant
    '&.MuiFormControl-sizeSmall .MuiOutlinedInput-root': {
      borderRadius: '8px',
    },
  };
});

export default StyledTextField;
