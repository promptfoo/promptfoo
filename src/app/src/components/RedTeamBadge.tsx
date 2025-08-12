import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';

interface RedTeamBadgeProps {
  tooltipPlacement?: 'top' | 'right' | 'bottom' | 'left';
  size?: 'small' | 'medium';
}

export default function RedTeamBadge({ 
  tooltipPlacement = 'right',
  size = 'small' 
}: RedTeamBadgeProps) {
  const theme = useTheme();
  
  const styles = size === 'small' 
    ? {
        fontSize: '0.65rem',
        px: 0.5,
        py: 0.125,
      }
    : {
        fontSize: '0.75rem',
        px: 0.75,
        py: 0.25,
      };

  return (
    <Tooltip title="Red Team Eval" placement={tooltipPlacement} arrow>
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor:
            theme.palette.mode === 'dark'
              ? 'rgba(239, 83, 80, 0.15)' // Soft red background for dark
              : 'rgba(211, 47, 47, 0.08)', // Very light red for light mode
          color:
            theme.palette.mode === 'dark'
              ? '#ff6b6b' // Soft coral red for dark mode
              : '#c62828', // Deep red for light mode
          border: '1px solid',
          borderColor:
            theme.palette.mode === 'dark'
              ? 'rgba(239, 83, 80, 0.4)' // Soft red border dark
              : 'rgba(211, 47, 47, 0.2)', // Light red border light
          borderRadius: '3px',
          fontWeight: 600,
          letterSpacing: '0.05em',
          fontFamily: theme.typography.fontFamily,
          lineHeight: 1.4,
          userSelect: 'none',
          textTransform: 'uppercase',
          ml: 0.5,
          ...styles,
        }}
        aria-label="Red team adversarial evaluation"
      >
        RT
      </Box>
    </Tooltip>
  );
}