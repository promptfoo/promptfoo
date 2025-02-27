import type { PaperProps } from '@mui/material';
import { Paper } from '@mui/material';
import { alpha, styled } from '@mui/material/styles';

export interface StyledCardProps extends PaperProps {
  isSelected?: boolean;
  isInteractive?: boolean;
  noPadding?: boolean;
}

const StyledCard = styled(Paper, {
  shouldForwardProp: (prop) =>
    !['isSelected', 'isInteractive', 'noPadding'].includes(prop as string),
})<StyledCardProps>(({ theme, isSelected, isInteractive, noPadding }) => ({
  borderRadius: '16px',
  height: '100%',
  background:
    theme.palette.mode === 'dark'
      ? `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.03)} 0%, ${alpha(
          theme.palette.primary.main,
          0,
        )} 100%)`
      : theme.palette.background.paper,
  backdropFilter: theme.palette.mode === 'dark' ? 'blur(12px)' : 'none',
  border: `1px solid ${
    isSelected
      ? theme.palette.primary.main
      : theme.palette.mode === 'dark'
        ? alpha(theme.palette.divider, 0.1)
        : theme.palette.divider
  }`,
  backgroundColor: isSelected
    ? alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.1 : 0.04)
    : 'background.paper',
  padding: noPadding ? 0 : theme.spacing(2.5),
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  cursor: isInteractive ? 'pointer' : 'default',
  userSelect: isInteractive ? 'none' : 'text',

  ...(isInteractive && {
    '&:hover': {
      transform: 'translateY(-2px)',
      boxShadow:
        theme.palette.mode === 'dark'
          ? `0 12px 24px -6px ${alpha(theme.palette.common.black, 0.15)}, 0 0 8px -2px ${alpha(
              theme.palette.primary.main,
              0.2,
            )}`
          : `0 8px 16px ${alpha(theme.palette.common.black, 0.09)}`,
      backgroundColor: isSelected
        ? alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.15 : 0.08)
        : alpha(theme.palette.action.hover, theme.palette.mode === 'dark' ? 0.1 : 0.04),
      borderColor: isSelected
        ? theme.palette.primary.main
        : alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.2 : 0.1),
    },
  }),
}));

export default StyledCard;
