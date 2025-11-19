import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { alpha } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { StrategyItem } from './StrategyItem';
import type { StrategyCardData } from './types';

interface AgenticStrategiesGroupProps {
  singleTurnStrategies: StrategyCardData[];
  multiTurnStrategies: StrategyCardData[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onConfigClick: (id: string) => void;
  onSelectNone: (strategyIds: string[]) => void;
  isStrategyDisabled: (strategyId: string) => boolean;
  isRemoteGenerationDisabled: boolean;
  isStrategyConfigured?: (strategyId: string) => boolean;
}

export function AgenticStrategiesGroup({
  singleTurnStrategies,
  multiTurnStrategies,
  selectedIds,
  onToggle,
  onConfigClick,
  onSelectNone,
  isStrategyDisabled,
  isRemoteGenerationDisabled,
  isStrategyConfigured,
}: AgenticStrategiesGroupProps) {
  // Calculate selected strategies across both subsections
  const allAgenticStrategies = [
    ...singleTurnStrategies.map((s) => s.id),
    ...multiTurnStrategies.map((s) => s.id),
  ];
  const selectedAgenticStrategies = allAgenticStrategies.filter((id) => selectedIds.includes(id));

  const handleResetAll = () => {
    if (onSelectNone) {
      onSelectNone(selectedAgenticStrategies);
    }
  };

  return (
    <Box sx={{ mb: 4 }}>
      {/* Parent header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h6">Agentic Strategies</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Advanced AI-powered strategies that dynamically adapt their attack patterns
          </Typography>
        </Box>
        {(singleTurnStrategies.length > 0 || multiTurnStrategies.length > 0) && (
          <Button
            variant="text"
            size="small"
            color="primary"
            onClick={handleResetAll}
            disabled={selectedAgenticStrategies.length === 0}
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
            Reset All
          </Button>
        )}
      </Box>

      {/* Container with subtle border/background */}
      <Box
        sx={{
          p: 2,
          backgroundColor: (theme) => alpha(theme.palette.background.paper, 0.5),
          borderRadius: 1,
          border: (theme) => `1px solid ${theme.palette.divider}`,
        }}
      >
        {/* Single-turn only subsection */}
        {singleTurnStrategies.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
              Single-turn Only
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              These strategies work only for single-turn evaluations
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
              {singleTurnStrategies.map((strategy) => (
                <StrategyItem
                  key={strategy.id}
                  strategy={strategy}
                  isSelected={selectedIds.includes(strategy.id)}
                  onToggle={onToggle}
                  onConfigClick={onConfigClick}
                  isDisabled={isStrategyDisabled(strategy.id)}
                  isRemoteGenerationDisabled={isRemoteGenerationDisabled}
                  isConfigured={isStrategyConfigured ? isStrategyConfigured(strategy.id) : true}
                />
              ))}
            </Box>
          </Box>
        )}

        {/* Single and multi-turn subsection */}
        {multiTurnStrategies.length > 0 && (
          <Box>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
              Single and Multi-turn
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              These strategies can be used for both single and multi-turn evaluations
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
              {multiTurnStrategies.map((strategy) => (
                <StrategyItem
                  key={strategy.id}
                  strategy={strategy}
                  isSelected={selectedIds.includes(strategy.id)}
                  onToggle={onToggle}
                  onConfigClick={onConfigClick}
                  isDisabled={isStrategyDisabled(strategy.id)}
                  isRemoteGenerationDisabled={isRemoteGenerationDisabled}
                  isConfigured={isStrategyConfigured ? isStrategyConfigured(strategy.id) : true}
                />
              ))}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
