import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import { alpha } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import {
  AGENTIC_STRATEGIES,
  CONFIGURABLE_STRATEGIES,
  DEFAULT_STRATEGIES,
  MULTI_MODAL_STRATEGIES,
} from '@promptfoo/redteam/constants';
import { StrategySampleGenerateButton } from '../StrategySampleDialog';

import type { StrategyCardData } from './types';

// Transform-only strategies supported in Milestone 1 (should match server-side allowlist)
const SUPPORTED_SAMPLE_STRATEGIES = new Set([
  'base64',
  'hex',
  'rot13',
  'leetspeak',
  'homoglyph',
  'morse',
  'piglatin',
  'camelcase',
  'emoji',
  'prompt-injection',
]);

// Demonstration simulation strategies supported in Milestone 2 with simulate mode
const SIMULATE_SAMPLE_STRATEGIES = new Set(['crescendo', 'goat', 'custom', 'mischievous-user']);

interface StrategyItemProps {
  strategy: StrategyCardData;
  isSelected: boolean;
  onToggle: (id: string) => void;
  onConfigClick: (id: string) => void;
  onSampleGenerate?: (id: string) => void;
  isGeneratingSample?: boolean;
}

export function StrategyItem({
  strategy,
  isSelected,
  onToggle,
  onConfigClick,
  onSampleGenerate,
  isGeneratingSample = false,
}: StrategyItemProps) {
  const hasSettingsButton = isSelected && CONFIGURABLE_STRATEGIES.includes(strategy.id as any);
  const hasSampleButton =
    onSampleGenerate &&
    (SUPPORTED_SAMPLE_STRATEGIES.has(strategy.id) || SIMULATE_SAMPLE_STRATEGIES.has(strategy.id));

  return (
    <Paper
      elevation={2}
      onClick={() => onToggle(strategy.id)}
      sx={(theme) => ({
        height: '100%',
        display: 'flex',
        cursor: 'pointer',
        userSelect: 'none',
        border: isSelected ? `1px solid ${theme.palette.primary.main}` : undefined,
        backgroundColor: isSelected
          ? alpha(theme.palette.primary.main, 0.04)
          : theme.palette.background.paper,
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
          backgroundColor: isSelected
            ? alpha(theme.palette.primary.main, 0.08)
            : alpha(theme.palette.action.hover, 0.04),
        },
      })}
    >
      {/* Checkbox container */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          pl: 1,
        }}
      >
        <Checkbox
          checked={isSelected}
          onChange={(e) => {
            e.stopPropagation();
            onToggle(strategy.id);
          }}
          onClick={(e) => e.stopPropagation()}
          color="primary"
        />
      </Box>

      {/* Content container */}
      <Box sx={{ flex: 1, p: 2, minWidth: 0, position: 'relative' }}>
        {/* Action buttons - positioned absolutely in the top-right corner */}
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            display: 'flex',
            gap: 0.5,
          }}
        >
          {/* Sample generation button */}
          {hasSampleButton && (
            <StrategySampleGenerateButton
              onClick={() => onSampleGenerate!(strategy.id)}
              isGenerating={isGeneratingSample}
              size="small"
            />
          )}
          {/* Settings button */}
          {hasSettingsButton && (
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onConfigClick(strategy.id);
              }}
              sx={{
                opacity: 0.6,
                '&:hover': {
                  opacity: 1,
                  backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.08),
                },
              }}
            >
              <SettingsOutlinedIcon fontSize="small" />
            </IconButton>
          )}
        </Box>

        {/* Title and badges section - add right padding when action buttons are present */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 1,
            mb: 1,
            pr: hasSettingsButton || hasSampleButton ? 6 : 0, // Add padding-right to avoid overlap with action buttons
          }}
        >
          <Typography variant="subtitle1" component="div">
            {strategy.name}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {DEFAULT_STRATEGIES.includes(strategy.id as any) && (
              <Chip label="Recommended" size="small" color="default" />
            )}
            {AGENTIC_STRATEGIES.includes(strategy.id as any) && (
              <Chip
                label="Agent"
                size="small"
                sx={{
                  backgroundColor: (theme) => alpha(theme.palette.warning.main, 0.1),
                  color: 'warning.main',
                  borderColor: 'warning.main',
                  border: 1,
                }}
              />
            )}
            {MULTI_MODAL_STRATEGIES.includes(strategy.id as any) && (
              <Chip
                label="Multi-modal"
                size="small"
                sx={{
                  backgroundColor: (theme) => alpha(theme.palette.info.main, 0.1),
                  color: 'info.main',
                  borderColor: 'info.main',
                  border: 1,
                }}
              />
            )}
          </Box>
        </Box>

        {/* Description section */}
        <Typography variant="body2" color="text.secondary">
          {strategy.description}
        </Typography>
      </Box>
    </Paper>
  );
}
