import type { ChipProps } from '@mui/material';
import { Chip } from '@mui/material';
import { alpha, styled } from '@mui/material/styles';

export type ChipVariant = 'primary' | 'warning' | 'error' | 'success' | 'info';

export interface StyledChipProps extends Omit<ChipProps, 'variant'> {
  variant?: ChipVariant;
}

const getChipColors = (theme: any, variant: ChipVariant = 'primary') => {
  const color = theme.palette[variant].main;
  const isDark = theme.palette.mode === 'dark';

  return {
    backgroundColor: alpha(color, isDark ? 0.1 : 0.05),
    color,
    borderColor: alpha(color, 0.2),
    '&:hover': {
      backgroundColor: alpha(color, isDark ? 0.15 : 0.08),
    },
  };
};

const StyledChip = styled(Chip, {
  shouldForwardProp: (prop) => prop !== 'variant',
})<StyledChipProps>(({ theme, variant = 'primary' }) => ({
  height: '24px',
  fontSize: '0.75rem',
  fontWeight: 500,
  border: '1px solid',
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  ...getChipColors(theme, variant as ChipVariant),
}));

export default StyledChip;
