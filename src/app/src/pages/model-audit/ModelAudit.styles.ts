import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import { alpha, styled } from '@mui/material/styles';

export const SeverityBadge = styled(Box)<{ severity: 'error' | 'warning' | 'info' | 'debug' }>(
  ({ theme, severity }) => ({
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
    ...(severity === 'debug' && {
      background: alpha(theme.palette.grey[500], 0.1),
      color: theme.palette.grey[700],
    }),
  }),
);

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
