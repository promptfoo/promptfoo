import type { ButtonProps } from '@mui/material';
import { Button } from '@mui/material';
import { alpha, styled } from '@mui/material/styles';

export interface StyledButtonProps extends ButtonProps {
  glowOnHover?: boolean;
}

const StyledButton = styled(Button, {
  shouldForwardProp: (prop) => prop !== 'glowOnHover',
})<StyledButtonProps>(({ theme, variant, color = 'primary', glowOnHover }) => {
  const isContained = variant === 'contained';
  const isOutlined = variant === 'outlined';
  const mainColor = theme.palette[color === 'inherit' ? 'primary' : color].main;
  const isDark = theme.palette.mode === 'dark';

  return {
    borderRadius: '12px',
    textTransform: 'none',
    fontWeight: 500,
    padding: '10px 20px',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',

    // Contained button styles
    ...(isContained && {
      background: isDark
        ? `linear-gradient(180deg, ${alpha(mainColor, 0.9)} 0%, ${mainColor} 100%)`
        : mainColor,
      boxShadow: 'none',
      '&:hover': {
        transform: 'translateY(-2px)',
        background: isDark
          ? `linear-gradient(180deg, ${mainColor} 0%, ${alpha(mainColor, 0.9)} 100%)`
          : theme.palette[color === 'inherit' ? 'primary' : color].dark,
        boxShadow: glowOnHover
          ? `0 8px 16px -4px ${alpha(mainColor, 0.4)}, 0 4px 8px -4px ${alpha(mainColor, 0.3)}`
          : `0 8px 16px -4px ${alpha(theme.palette.common.black, 0.2)}`,
      },
    }),

    // Outlined button styles
    ...(isOutlined && {
      borderColor: alpha(mainColor, isDark ? 0.2 : 0.5),
      background: isDark
        ? `linear-gradient(180deg, ${alpha(mainColor, 0.05)} 0%, ${alpha(mainColor, 0)} 100%)`
        : 'none',
      backdropFilter: isDark ? 'blur(8px)' : 'none',
      '&:hover': {
        transform: 'translateY(-2px)',
        borderColor: mainColor,
        backgroundColor: alpha(mainColor, isDark ? 0.1 : 0.04),
        boxShadow: glowOnHover ? `0 4px 8px -4px ${alpha(mainColor, 0.3)}` : 'none',
      },
    }),

    // Text button styles
    ...(!isContained &&
      !isOutlined && {
        '&:hover': {
          transform: 'translateY(-2px)',
          backgroundColor: alpha(mainColor, isDark ? 0.1 : 0.04),
        },
      }),

    // Disabled state
    '&.Mui-disabled': {
      backgroundColor: isDark
        ? alpha(theme.palette.action.disabled, 0.15)
        : alpha(theme.palette.action.disabled, 0.1),
      color: theme.palette.text.disabled,
    },
  };
});

export default StyledButton;
