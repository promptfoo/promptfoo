import React from 'react';
import { Typography, Box, Button } from '@mui/material';
import { StrategyItem } from './StrategyItem';
import type { StrategyCardData } from './types';

interface StrategySectionProps {
  title: string;
  strategies: StrategyCardData[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onConfigClick: (id: string) => void;
  onSelectNone?: (strategyIds: string[]) => void;
}

export function StrategySection({
  title,
  strategies,
  selectedIds,
  onToggle,
  onConfigClick,
  onSelectNone,
}: StrategySectionProps) {
  const selectedStrategiesInSection = strategies
    .map((strategy) => strategy.id)
    .filter((id) => selectedIds.includes(id));

  const handleSelectNone = () => {
    if (onSelectNone) {
      onSelectNone(selectedStrategiesInSection);
    } else {
      // Fallback to the old approach if onSelectNone not provided
      selectedStrategiesInSection.forEach((id) => onToggle(id));
    }
  };

  return (
    <Box sx={{ mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">{title}</Typography>
        {strategies.length > 0 && (
          <Button
            variant="text"
            size="small"
            color="primary"
            onClick={handleSelectNone}
            disabled={selectedStrategiesInSection.length === 0}
            sx={{
              fontSize: '0.875rem',
              fontWeight: 'normal',
              padding: 0,
              margin: 0,
              '&:hover': {
                backgroundColor: 'transparent',
              },
            }}
          >
            Reset
          </Button>
        )}
      </Box>
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
