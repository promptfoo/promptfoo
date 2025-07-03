import React from 'react';
import { Typography, Box, Button } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { StrategyItem } from './StrategyItem';
import type { StrategyCardData } from './types';

interface StrategySectionProps {
  title: string;
  strategies: StrategyCardData[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onConfigClick: (id: string) => void;
  onSelectNone?: (strategyIds: string[]) => void;
  highlighted?: boolean;
  description?: string;
}

export function StrategySection({
  title,
  strategies,
  selectedIds,
  onToggle,
  onConfigClick,
  onSelectNone,
  highlighted = false,
  description,
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
        <Box>
          <Typography
            variant="h6"
            sx={
              highlighted
                ? {
                    color: 'primary.main',
                    fontWeight: 'bold',
                  }
                : undefined
            }
          >
            {title}
          </Typography>
          {description && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {description}
            </Typography>
          )}
        </Box>
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
          ...(highlighted && {
            p: 2,
            backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.02),
            borderRadius: 1,
            border: (theme) => `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
          }),
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
