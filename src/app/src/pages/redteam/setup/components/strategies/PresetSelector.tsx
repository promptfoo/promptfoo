import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import PresetCard from '../PresetCard';
import { STRATEGY_PRESETS } from './types';

import type { PresetId, StrategyPreset } from './types';

interface PresetSelectorProps {
  presets: StrategyPreset[];
  selectedPreset: PresetId | 'Custom';
  onSelect: (preset: StrategyPreset | { name: 'Custom' }) => void;
}

export function PresetSelector({ presets, selectedPreset, onSelect }: PresetSelectorProps) {
  return (
    <Box sx={{ mb: 4 }}>
      <Grid
        container
        spacing={2}
        sx={{
          justifyContent: {
            xs: 'center',
            sm: 'flex-start',
          },
        }}
      >
        {presets.map((preset) => (
          <Box key={preset.name}>
            <PresetCard
              name={preset.name}
              description={preset.description}
              isSelected={
                selectedPreset ===
                Object.entries(STRATEGY_PRESETS).find(
                  ([_, p]) => (p as StrategyPreset).name === preset.name,
                )?.[0]
              }
              onClick={() => onSelect(preset)}
            />
          </Box>
        ))}
        <Grid
          sx={{
            minWidth: { xs: '280px', sm: '280px' },
            maxWidth: { xs: '100%', sm: '280px' },
          }}
          size={{
            xs: 12,
            sm: 6,
            md: 3,
          }}
        >
          <PresetCard
            name="Custom"
            description="Configure your own set of strategies"
            isSelected={selectedPreset === 'Custom'}
            onClick={() => onSelect({ name: 'Custom' })}
          />
        </Grid>
      </Grid>
    </Box>
  );
}
