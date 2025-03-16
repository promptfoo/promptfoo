import React from 'react';
import { Typography, Box } from '@mui/material';
import { StrategyItem } from './StrategyItem';
import type { StrategyCardData } from './types';

interface StrategySectionProps {
  title: string;
  strategies: StrategyCardData[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onConfigClick: (id: string) => void;
}

export function StrategySection({
  title,
  strategies,
  selectedIds,
  onToggle,
  onConfigClick,
}: StrategySectionProps) {
  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
        {title}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, 1fr)',
            lg: 'repeat(3, 1fr)',
          },
          gap: 2,
        }}
      >
        {strategies.map((strategy) => (
          <StrategyItem
            key={strategy.id}
            strategy={strategy}
            isSelected={selectedIds.includes(strategy.id)}
            onToggle={onToggle}
            onConfigClick={onConfigClick}
          />
        ))}
      </Box>
    </Box>
  );
}
