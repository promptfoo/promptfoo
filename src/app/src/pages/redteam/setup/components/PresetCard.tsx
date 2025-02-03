import React from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';

interface PresetCardProps {
  name: string;
  description?: string;
  isSelected: boolean;
  onClick: () => void;
}

export default function PresetCard({ name, description, isSelected, onClick }: PresetCardProps) {
  return (
    <Paper
      elevation={1}
      onClick={onClick}
      sx={{
        p: 3,
        height: '100%',
        cursor: 'pointer',
        borderRadius: 2,
        border: (theme) =>
          isSelected ? `1px solid ${theme.palette.primary.main}` : '1px solid transparent',
        backgroundColor: (theme) =>
          isSelected ? alpha(theme.palette.primary.main, 0.04) : 'background.paper',
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
          backgroundColor: (theme) =>
            isSelected
              ? alpha(theme.palette.primary.main, 0.08)
              : alpha(theme.palette.action.hover, 0.04),
        },
      }}
    >
      <Typography variant="h6" sx={{ fontWeight: 'medium', mb: description ? 1 : 0 }}>
        {name}
      </Typography>
      {description && (
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
      )}
    </Paper>
  );
}
