import { useState } from 'react';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import WarningIcon from '@mui/icons-material/Warning';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import { alpha, useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import type { JobError } from '@promptfoo/types';

interface ErrorsPanelProps {
  errors: JobError[];
}

/**
 * Errors panel showing aggregated errors with expandable details
 */
export function ErrorsPanel({ errors }: ErrorsPanelProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(true);

  if (errors.length === 0) {
    return null;
  }

  const totalErrorCount = errors.reduce((sum, e) => sum + e.count, 0);

  return (
    <Box sx={{ mb: 2 }}>
      <Box
        onClick={() => setExpanded(!expanded)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          py: 0.5,
        }}
      >
        <WarningIcon sx={{ color: theme.palette.warning.main, mr: 1, fontSize: 20 }} />
        <Typography variant="subtitle2" color="text.secondary">
          Errors ({totalErrorCount})
        </Typography>
        <IconButton
          size="small"
          sx={{
            ml: 'auto',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        >
          <ExpandMoreIcon fontSize="small" />
        </IconButton>
      </Box>
      <Collapse in={expanded}>
        <Box
          sx={{
            mt: 1,
            p: 1.5,
            borderRadius: 1,
            backgroundColor: alpha(theme.palette.warning.main, 0.1),
            border: `1px solid ${alpha(theme.palette.warning.main, 0.3)}`,
          }}
        >
          {errors.map((error, index) => (
            <Box
              key={index}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                py: 0.5,
                '&:not(:last-child)': {
                  borderBottom: `1px solid ${theme.palette.divider}`,
                  pb: 1,
                  mb: 1,
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip
                  label={error.type.replace('_', ' ')}
                  size="small"
                  sx={{
                    textTransform: 'capitalize',
                    backgroundColor: alpha(theme.palette.warning.main, 0.2),
                  }}
                />
                <Typography variant="body2" color="text.secondary">
                  {error.message}
                </Typography>
              </Box>
              {error.count > 1 && (
                <Typography variant="caption" color="text.secondary">
                  ×{error.count}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}
