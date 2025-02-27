import type { CheckboxProps, FormControlLabelProps } from '@mui/material';
import { Checkbox, FormControlLabel } from '@mui/material';
import { alpha, styled } from '@mui/material/styles';

interface StyledCheckboxProps extends CheckboxProps {
  glowOnFocus?: boolean;
}

interface StyledCheckboxLabelProps extends Omit<FormControlLabelProps, 'control'> {
  checkboxProps?: StyledCheckboxProps;
}

const StyledCheckbox = styled(Checkbox, {
  shouldForwardProp: (prop) => prop !== 'glowOnFocus',
})<StyledCheckboxProps>(({ theme, glowOnFocus }) => {
  const isDark = theme.palette.mode === 'dark';

  return {
    padding: '9px',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',

    '&:hover': {
      backgroundColor: alpha(theme.palette.action.hover, isDark ? 0.1 : 0.04),
    },

    '&.Mui-focusVisible': {
      ...(glowOnFocus && {
        boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, isDark ? 0.15 : 0.1)}`,
      }),
    },

    '& .MuiSvgIcon-root': {
      fontSize: '1.25rem',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    },

    '&.Mui-checked': {
      '& .MuiSvgIcon-root': {
        color: theme.palette.primary.main,
      },
      '&:hover': {
        backgroundColor: alpha(theme.palette.primary.main, isDark ? 0.15 : 0.08),
      },
    },

    // Indeterminate state
    '&.MuiCheckbox-indeterminate': {
      '& .MuiSvgIcon-root': {
        color: alpha(theme.palette.primary.main, 0.7),
      },
      '&:hover': {
        backgroundColor: alpha(theme.palette.primary.main, isDark ? 0.15 : 0.08),
      },
    },

    // Disabled state
    '&.Mui-disabled': {
      '& .MuiSvgIcon-root': {
        color: theme.palette.action.disabled,
      },
    },
  };
});

const StyledFormControlLabel = styled(FormControlLabel)(({ theme }) => ({
  margin: 0,
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',

  '& .MuiFormControlLabel-label': {
    transition: 'color 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  },

  '&:hover': {
    '& .MuiFormControlLabel-label': {
      color: theme.palette.text.primary,
    },
  },

  '&.Mui-disabled': {
    '& .MuiFormControlLabel-label': {
      color: theme.palette.text.disabled,
    },
  },

  // When checkbox is checked, make the label more prominent
  '& .Mui-checked + .MuiFormControlLabel-label': {
    color: theme.palette.text.primary,
    fontWeight: 500,
  },
}));

const StyledCheckboxLabel = ({ checkboxProps, ...labelProps }: StyledCheckboxLabelProps) => (
  <StyledFormControlLabel control={<StyledCheckbox {...checkboxProps} />} {...labelProps} />
);

export type { StyledCheckboxProps, StyledCheckboxLabelProps };
export { StyledCheckboxLabel };
export default StyledCheckbox;
