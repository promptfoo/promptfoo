import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import { alpha } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  AGENTIC_STRATEGIES,
  CONFIGURABLE_STRATEGIES,
  DEFAULT_STRATEGIES,
  MULTI_MODAL_STRATEGIES,
  displayNameOverrides as pluginDisplayNames,
  type Plugin,
} from '@promptfoo/redteam/constants';
import { TestCaseGenerateButton } from './../TestCaseDialog';
import { useTestCaseGeneration } from './../TestCaseGenerationProvider';
import type { StrategyCardData } from './types';

const TEST_GENERATION_PLUGIN = 'harmful:hate';
const TEST_GENERATION_PLUGIN_DISPLAY_NAME = pluginDisplayNames[TEST_GENERATION_PLUGIN as Plugin];

interface StrategyItemProps {
  strategy: StrategyCardData;
  isSelected: boolean;
  onToggle: (id: string) => void;
  onConfigClick: (id: string) => void;
  isDisabled: boolean;
  isRemoteGenerationDisabled: boolean;
}

export function StrategyItem({
  strategy,
  isSelected,
  onToggle,
  onConfigClick,
  isDisabled,
  isRemoteGenerationDisabled,
}: StrategyItemProps) {
  const hasSettingsButton = isSelected && CONFIGURABLE_STRATEGIES.includes(strategy.id as any);

  const {
    generateTestCase,
    isGenerating: generatingTestCase,
    currentStrategy,
  } = useTestCaseGeneration();

  const handleTestCaseGeneration = async () => {
    await generateTestCase(
      { id: TEST_GENERATION_PLUGIN, config: {} },
      // TODO: Strategy config
      { id: strategy.id, config: {} },
      { telemetryFeature: 'redteam_strategy_generate_test_case', mode: 'result' },
    );
  };

  return (
    <Paper
      elevation={2}
      onClick={() => onToggle(strategy.id)}
      sx={(theme) => ({
        height: '100%',
        display: 'flex',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        userSelect: 'none',
        opacity: isDisabled ? 0.5 : 1,
        border: isSelected ? `1px solid ${theme.palette.primary.main}` : undefined,
        backgroundColor: isDisabled
          ? theme.palette.action.disabledBackground
          : isSelected
            ? alpha(theme.palette.primary.main, 0.04)
            : theme.palette.background.paper,
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
          backgroundColor: isDisabled
            ? theme.palette.action.disabledBackground
            : isSelected
              ? alpha(theme.palette.primary.main, 0.08)
              : alpha(theme.palette.action.hover, 0.04),
        },
        p: 1,
        gap: 2,
      })}
    >
      {/* Checkbox container */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Checkbox
          checked={isSelected}
          disabled={isDisabled}
          onChange={(e) => {
            e.stopPropagation();
            onToggle(strategy.id);
          }}
          onClick={(e) => e.stopPropagation()}
          color="primary"
        />
      </Box>

      {/* Content container */}
      <Box sx={{ flex: 1, py: 2, minWidth: 0, position: 'relative' }}>
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
            {isDisabled && isRemoteGenerationDisabled && (
              <Tooltip title="This strategy requires remote generation. Unset PROMPTFOO_DISABLE_REMOTE_GENERATION or PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION to enable.">
                <Typography
                  variant="caption"
                  sx={(theme) => ({
                    fontSize: '0.7rem',
                    color: 'error.main',
                    fontWeight: 500,
                    backgroundColor: alpha(theme.palette.error.main, 0.08),
                    px: 0.5,
                    py: 0.25,
                    borderRadius: 0.5,
                    border: `1px solid ${alpha(theme.palette.error.main, 0.3)}`,
                  })}
                >
                  Remote generation required
                </Typography>
              </Tooltip>
            )}
          </Box>
        </Box>

        {/* Description section */}
        <Typography variant="body2" color="text.secondary">
          {strategy.description}
        </Typography>
      </Box>

      {/* Secondary Actions Container */}
      <Box>
        <TestCaseGenerateButton
          onClick={handleTestCaseGeneration}
          disabled={isDisabled || generatingTestCase}
          isGenerating={generatingTestCase && currentStrategy === strategy.id}
          size="small"
          tooltipTitle={`Generate a test case for ${strategy.name} Strategy with ${TEST_GENERATION_PLUGIN_DISPLAY_NAME} plugin`}
        />

        {/* Settings button - positioned absolutely in the top-right corner */}
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
    </Paper>
  );
}
