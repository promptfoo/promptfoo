import { Box, Paper, alpha, styled } from '@mui/material';

export const SeverityBadge = styled(Box)<{ severity: string }>(({ theme, severity }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 12px',
  borderRadius: 20,
  fontSize: '0.75rem',
  fontWeight: 600,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
  ...(severity === 'error' && {
    background: alpha(theme.palette.error.main, 0.1),
    color: theme.palette.error.main,
  }),
  ...(severity === 'warning' && {
    background: alpha(theme.palette.warning.main, 0.1),
    color: theme.palette.warning.dark,
  }),
  ...(severity === 'info' && {
    background: alpha(theme.palette.info.main, 0.1),
    color: theme.palette.info.main,
  }),
}));

export const StatCard = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(3),
  textAlign: 'center',
  transition: 'all 0.3s ease',
  cursor: 'pointer',
  '&:hover': {
    transform: 'translateY(-4px)',
    boxShadow: theme.shadows[8],
  },
}));
