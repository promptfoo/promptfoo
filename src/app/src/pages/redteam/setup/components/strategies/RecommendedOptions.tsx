import React from 'react';
import { Paper, Box, Typography, Checkbox, FormControlLabel } from '@mui/material';
import { STRATEGY_PRESETS, PRESET_IDS } from './types';

interface RecommendedOptionsProps {
  isMultiTurnEnabled: boolean;
  onMultiTurnChange: (checked: boolean) => void;
}

export function RecommendedOptions({
  isMultiTurnEnabled,
  onMultiTurnChange,
}: RecommendedOptionsProps) {
  const mediumPreset = STRATEGY_PRESETS[PRESET_IDS.MEDIUM];
  if (!mediumPreset?.options?.multiTurn) {
    return null;
  }

  return (
    <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        Recommended Options
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={isMultiTurnEnabled}
              onChange={(e) => onMultiTurnChange(e.target.checked)}
            />
          }
          label={
            <Box>
              <Typography variant="body2" component="span">
                {mediumPreset.options.multiTurn.label}
              </Typography>
              <Typography variant="body2" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
                Adds multi-turn strategies like GOAT for conversational applications
              </Typography>
            </Box>
          }
        />
      </Box>
    </Paper>
  );
}
