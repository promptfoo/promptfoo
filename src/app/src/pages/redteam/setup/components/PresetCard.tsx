import React from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { PLUGIN_PRESET_DESCRIPTIONS } from '@promptfoo/redteam/constants';

interface PresetCardProps {
  name: string;
  isSelected: boolean;
  onClick: () => void;
}

export default function PresetCard({ name, isSelected, onClick }: PresetCardProps) {
  return (
    <Paper
      onClick={onClick}
      sx={{
        p: 3,
        height: '100%',
        minHeight: 120,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.2s ease-in-out',
        borderRadius: 2,
        border: (theme) =>
          `1px solid ${isSelected ? theme.palette.primary.main : theme.palette.divider}`,
        bgcolor: (theme) =>
          isSelected ? alpha(theme.palette.primary.main, 0.04) : 'background.paper',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: (theme) => `0 6px 20px ${alpha(theme.palette.common.black, 0.09)}`,
          bgcolor: (theme) =>
            isSelected
              ? alpha(theme.palette.primary.main, 0.08)
              : alpha(theme.palette.action.hover, 0.04),
          '& .MuiTypography-root': {
            color: 'primary.main',
          },
        },
      }}
    >
      <Typography
        variant="h6"
        sx={{
          fontWeight: 500,
          textAlign: 'center',
          color: isSelected ? 'primary.main' : 'text.primary',
          transition: 'color 0.2s ease-in-out',
        }}
      >
        {name}
      </Typography>

      <Typography
        variant="body2"
        color="text.secondary"
        sx={{
          mt: 1,
          textAlign: 'center',
          opacity: 0.8,
        }}
      >
        {PLUGIN_PRESET_DESCRIPTIONS[name] || ''}
      </Typography>
    </Paper>
  );
}
