import React from 'react';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import { Paper, Box, Typography, Chip, Checkbox, IconButton } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { DEFAULT_STRATEGIES, AGENTIC_STRATEGIES } from '@promptfoo/redteam/constants';
import { MULTI_MODAL_STRATEGIES } from './constants';
import type { StrategyCardData } from './types';

const CONFIGURABLE_STRATEGIES = [
  'multilingual',
  'best-of-n',
  'goat',
  'crescendo',
  'pandamonium',
  'jailbreak',
  'jailbreak:tree',
  'gcg',
  'citation',
] as const;

interface StrategyItemProps {
  strategy: StrategyCardData;
  isSelected: boolean;
  onToggle: (id: string) => void;
  onConfigClick: (id: string) => void;
}

export function StrategyItem({ strategy, isSelected, onToggle, onConfigClick }: StrategyItemProps) {
  const hasSettingsButton = isSelected && CONFIGURABLE_STRATEGIES.includes(strategy.id as any);

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
        {/* Settings button - positioned absolutely in the top-right corner */}
        {hasSettingsButton && (
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onConfigClick(strategy.id);
            }}
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
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

        {/* Title and badges section - add right padding when settings button is present */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 1,
            mb: 1,
            pr: hasSettingsButton ? 5 : 0, // Add padding-right to avoid overlap with settings button
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
            {strategy.id === 'pandamonium' && (
              <Chip
                label="Experimental"
                size="small"
                sx={{
                  backgroundColor: (theme) =>
                    theme.palette.mode === 'dark'
                      ? alpha(theme.palette.error.main, 0.1)
                      : alpha(theme.palette.error.main, 0.1),
                  color: 'error.main',
                  borderColor: 'error.main',
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
