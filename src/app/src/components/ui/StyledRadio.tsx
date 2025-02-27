import type { RadioProps, FormControlLabelProps } from '@mui/material';
import { Radio, FormControlLabel } from '@mui/material';
import { alpha, styled } from '@mui/material/styles';

export interface StyledRadioProps extends RadioProps {
  glowOnFocus?: boolean;
}

export interface StyledRadioLabelProps extends Omit<FormControlLabelProps, 'control'> {
  radioProps?: StyledRadioProps;
}

const StyledRadio = styled(Radio, {
  shouldForwardProp: (prop) => prop !== 'glowOnFocus',
})<StyledRadioProps>(({ theme, glowOnFocus }) => {
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

  // When radio is checked, make the label more prominent
  '& .Mui-checked + .MuiFormControlLabel-label': {
    color: theme.palette.text.primary,
    fontWeight: 500,
  },
}));

const StyledRadioLabel = ({ radioProps, ...labelProps }: StyledRadioLabelProps) => (
  <StyledFormControlLabel control={<StyledRadio {...radioProps} />} {...labelProps} />
);

export { StyledRadioLabel };
export default StyledRadio;
