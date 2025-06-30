import React from 'react';
import {
  Typography,
  Box,
  Button,
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  Alert,
} from '@mui/material';
import { StrategyItem } from './StrategyItem';
import type { StrategyCardData } from './types';

interface StrategySectionProps {
  title: string;
  strategies: StrategyCardData[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onConfigClick: (id: string) => void;
  onSelectNone?: (strategyIds: string[]) => void;
  // Multi-turn specific props
  showMultiTurnConfig?: boolean;
  isStatefulValue?: boolean;
  onStatefulChange?: (val: boolean) => void;
  hasSessionParser?: boolean;
}

export function StrategySection({
  title,
  strategies,
  selectedIds,
  onToggle,
  onConfigClick,
  onSelectNone,
  showMultiTurnConfig,
  isStatefulValue,
  onStatefulChange,
  hasSessionParser,
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

      {/* Simple, direct question about system statefulness */}
      {showMultiTurnConfig && (
        <Box sx={{ mt: 2, p: 2, backgroundColor: 'background.default', borderRadius: 1 }}>
          <FormControl component="fieldset">
            <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 500 }}>
              Does your target system remember conversation history?
            </Typography>
            <RadioGroup
              row
              value={String(isStatefulValue)}
              onChange={(e) => onStatefulChange?.(e.target.value === 'true')}
            >
              <FormControlLabel value="true" control={<Radio size="small" />} label="Yes" />
              <FormControlLabel value="false" control={<Radio size="small" />} label="No" />
            </RadioGroup>
            {!hasSessionParser && isStatefulValue && (
              <Alert severity="warning" sx={{ mt: 1.5, py: 1 }}>
                <Typography variant="body2">
                  Configure session handling in your Target setup.
                </Typography>
              </Alert>
            )}
          </FormControl>
        </Box>
      )}
    </Box>
  );
}
