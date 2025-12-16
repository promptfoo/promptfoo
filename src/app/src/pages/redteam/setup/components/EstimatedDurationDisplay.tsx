import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { Config } from '../types';
import { getEstimatedDuration } from './strategies/utils';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

interface EstimatedDurationDisplayProps {
  config: Config;
}

export default function EstimatedDurationDisplay({ config }: EstimatedDurationDisplayProps) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        mb: 3,
        p: 2,
        borderRadius: 1,
        backgroundColor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography variant="body1" color="text.secondary">
          Estimated Duration:
        </Typography>
      </Box>
      <Typography variant="body1" fontWeight="bold" color="primary.main">
        {getEstimatedDuration(config)}
      </Typography>
      <Tooltip title="Estimated time includes test generation and probe execution. Actual time may vary based on target response times and network conditions.">
        <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary', cursor: 'help' }} />
      </Tooltip>
    </Box>
  );
}
