import React from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import { useResultsViewSettingsStore } from '../../store';
import CompactSettingsPanel from './CompactSettingsPanel';

const SettingsPanel: React.FC = () => {
  const theme = useTheme();
  const { isCompactView, setIsCompactView } = useResultsViewSettingsStore();

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Clean Professional Toggle */}
      <Box
        sx={{
          px: 3,
          py: 2,
          borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
          backgroundColor: alpha(theme.palette.background.default, 0.5),
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 500,
                color: theme.palette.text.primary,
                fontSize: '0.875rem',
              }}
            >
              Layout Mode
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: theme.palette.text.secondary,
                fontSize: '0.75rem',
              }}
            >
              Choose between classic and compact layouts
            </Typography>
          </Stack>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography
              variant="caption"
              sx={{
                color: theme.palette.text.secondary,
                fontSize: '0.75rem',
              }}
            >
              {isCompactView ? 'Compact' : 'Classic'}
            </Typography>
            <Switch
              checked={isCompactView}
              onChange={(e) => setIsCompactView(e.target.checked)}
              size="small"
              sx={{
                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                  backgroundColor: theme.palette.primary.main,
                },
              }}
            />
          </Stack>
        </Stack>
      </Box>

      {/* Clean Table-like Settings */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <CompactSettingsPanel />
      </Box>
    </Box>
  );
};

export default React.memo(SettingsPanel);
