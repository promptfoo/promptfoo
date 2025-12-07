import React, { useEffect, useMemo, useState } from 'react';

import MagicWandIcon from '@mui/icons-material/AutoFixHigh';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Popover from '@mui/material/Popover';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import {
  categoryAliases,
  displayNameOverrides,
  isMultiTurnStrategy,
  type Plugin,
  type Strategy,
} from '@promptfoo/redteam/constants';
import { BaseNumberInput } from '@app/components/form/input/BaseNumberInput';
import {
  getPluginDocumentationUrl,
  hasSpecificPluginDocumentation,
} from './pluginDocumentationMap';
import { useApiHealth } from '@app/hooks/useApiHealth';
import Chip from '@mui/material/Chip';
import ChatMessages, {
  type LoadedMessage,
  type LoadingMessage,
  type Message,
} from '@app/pages/eval/components/ChatMessages';
import {
  type GeneratedTestCase,
  type TargetResponse,
  type TargetPlugin,
  type TargetStrategy,
} from './TestCaseGenerationProvider';

interface TestCaseDialogProps {
  open: boolean;
  onClose: () => void;
  plugin: TargetPlugin | null;
  strategy: TargetStrategy | null;
  isGenerating: boolean;
  generatedTestCases: GeneratedTestCase[];
  targetResponses: TargetResponse[];
  isRunningTest?: boolean;
  onRegenerate: (newPluginId?: string) => void;
  onContinue: (additionalTurns: number) => void;
  currentTurn: number;
  maxTurns: number;
  availablePlugins: string[];
}

export const TestCaseDialog: React.FC<TestCaseDialogProps> = ({
  open,
  onClose,
  plugin,
  strategy,
  isGenerating,
  generatedTestCases,
  targetResponses,
  isRunningTest = false,
  onRegenerate,
  onContinue,
  currentTurn,
  maxTurns,
  availablePlugins,
}) => {
  const pluginName = plugin?.id ?? '';
  const pluginDisplayName =
    displayNameOverrides[pluginName as Plugin] ||
    categoryAliases[pluginName as Plugin] ||
    pluginName;

  // State for the selected plugin
  const [selectedPlugin, setSelectedPlugin] = useState<string>(pluginName);

  // Popover state for plugin selector
  const [pluginPopoverAnchor, setPluginPopoverAnchor] = useState<HTMLElement | null>(null);
  const isPluginPopoverOpen = Boolean(pluginPopoverAnchor);

  // Sync selected plugin with the current plugin when it changes
  useEffect(() => {
    if (pluginName) {
      setSelectedPlugin(pluginName);
    }
  }, [pluginName]);

  // Get display name for the selected plugin
  const selectedPluginDisplayName =
    displayNameOverrides[selectedPlugin as Plugin] ||
    categoryAliases[selectedPlugin as Plugin] ||
    selectedPlugin;

  const strategyName = strategy?.id ?? '';
  const strategyDisplayName = displayNameOverrides[strategyName as Strategy] || strategyName;

  const turnMessages = useMemo<Message[]>(() => {
    const messages = [];

    for (let i = 0; i < maxTurns; i++) {
      const generatedTestCase = generatedTestCases[i];

      if (generatedTestCase) {
        messages.push({
          role: 'user' as const,
          content: generatedTestCase.prompt,
          contentType:
            strategyName === 'audio'
              ? ('audio' as const)
              : strategyName === 'image'
                ? ('image' as const)
                : strategyName === 'video'
                  ? ('video' as const)
                  : ('text' as const),
        } as LoadedMessage);
      }

      const targetResponse = targetResponses[i];

      if (targetResponse) {
        messages.push({
          role: 'assistant' as const,
          content: targetResponse.output ?? targetResponse.error ?? 'No response from target',
          contentType: 'text' as const,
        } as LoadedMessage);
      }
    }

    // Indicate loading state to the user
    if (
      isGenerating &&
      generatedTestCases.length === targetResponses.length &&
      generatedTestCases.length < maxTurns
    ) {
      messages.push({ role: 'user' as const, loading: true } as LoadingMessage);
    } else if (isRunningTest) {
      messages.push({ role: 'assistant' as const, loading: true } as LoadingMessage);
    }

    return messages;
  }, [
    generatedTestCases,
    targetResponses,
    currentTurn,
    maxTurns,
    isGenerating,
    isRunningTest,
    strategyName,
  ]);

  const canAddAdditionalTurns =
    !isGenerating && !isRunningTest && isMultiTurnStrategy(strategyName as Strategy);

  const renderPluginDocumentationLink =
    pluginName && !plugin?.isStatic && hasSpecificPluginDocumentation(pluginName as Plugin);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      sx={{
        // Ensure the container is always rendered in front of tooltips
        zIndex: 10000,
      }}
      data-testid="test-case-dialog"
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 1,
          px: 3,
          py: 2,
        }}
      >
        <DialogTitle
          sx={{
            // Override the default padding to set it consistently on the parent container
            p: 0,
          }}
        >
          Test Case
        </DialogTitle>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Chip
            label={`Strategy: ${strategyDisplayName}${maxTurns > 1 ? ` (${maxTurns} turns)` : ''}`}
            data-testid="strategy-chip"
          />
          <Tooltip title="Click to change plugin">
            <Chip
              label={`Plugin: ${selectedPluginDisplayName}`}
              data-testid="plugin-chip"
              onClick={(e) => setPluginPopoverAnchor(e.currentTarget)}
              clickable
              color={selectedPlugin !== pluginName ? 'primary' : 'default'}
              sx={{ cursor: 'pointer' }}
            />
          </Tooltip>
          <Popover
            open={isPluginPopoverOpen}
            anchorEl={pluginPopoverAnchor}
            onClose={() => setPluginPopoverAnchor(null)}
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'left',
            }}
            transformOrigin={{
              vertical: 'top',
              horizontal: 'left',
            }}
            sx={{ zIndex: 10001 }}
            slotProps={{
              paper: {
                sx: { overflow: 'visible' },
              },
            }}
          >
            <Box sx={{ p: 2, minWidth: 250 }}>
              <Autocomplete
                size="small"
                value={selectedPlugin}
                onChange={(_, newValue) => {
                  if (newValue) {
                    setSelectedPlugin(newValue);
                    setPluginPopoverAnchor(null);
                  }
                }}
                options={availablePlugins}
                getOptionLabel={(option) =>
                  (displayNameOverrides as Record<string, string>)[option] ||
                  (categoryAliases as Record<string, string>)[option] ||
                  option
                }
                disableClearable
                slotProps={{
                  popper: {
                    disablePortal: true,
                  },
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    variant="outlined"
                    size="small"
                    label="Select Plugin"
                  />
                )}
              />
            </Box>
          </Popover>
        </Box>
      </Box>
      <DialogContent>
        <Stack direction="column" gap={2}>
          <ChatMessages
            messages={turnMessages}
            displayTurnCount={maxTurns > 1}
            maxTurns={maxTurns}
          />
          {generatedTestCases.length > 0 && (
            <Alert severity="info">
              Dissatisfied with the test case? Fine tune it by adjusting your{' '}
              {pluginName === 'policy' ? 'Policy details' : 'Application Details'}.
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions
        sx={{
          justifyContent: renderPluginDocumentationLink ? 'space-between' : 'flex-end',
          px: 3,
          pb: 3,
        }}
      >
        {renderPluginDocumentationLink && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Link
              href={getPluginDocumentationUrl(pluginName as Plugin)}
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                fontSize: '0.875rem',
                textDecoration: 'none',
                '&:hover': {
                  textDecoration: 'underline',
                },
              }}
            >
              Learn more about {pluginDisplayName}
              <Box component="span" sx={{ fontSize: '0.75rem' }}>
                ↗
              </Box>
            </Link>
          </Box>
        )}

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          {canAddAdditionalTurns && (
            <>
              <MultiTurnExtensionControl onContinue={onContinue} />{' '}
              <Divider orientation="vertical" flexItem />
            </>
          )}
          <Button
            onClick={() => onRegenerate(selectedPlugin)}
            variant={canAddAdditionalTurns ? 'outlined' : 'contained'}
            loading={isGenerating || isRunningTest}
          >
            {canAddAdditionalTurns ? 'Start Over' : 'Regenerate'}
          </Button>
          <Button onClick={onClose} variant="outlined" color="error">
            Close
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
};

export const TestCaseGenerateButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  isGenerating?: boolean;
  size?: 'small' | 'medium';
  tooltipTitle?: string;
}> = ({ onClick, disabled = false, isGenerating = false, size = 'small', tooltipTitle }) => {
  const {
    data: { status: apiHealthStatus },
  } = useApiHealth();
  const isRemoteDisabled = apiHealthStatus !== 'connected';

  // Tooltip component uses controlled state in order to imperatively close it when the Test Case
  // Generation dialog is rendered (by default it will remain open even after the dialog is closed).
  const [shouldRenderTooltip, setShouldRenderTooltip] = useState<boolean>(false);

  const showTooltip = () => setShouldRenderTooltip(true);
  const hideTooltip = () => setShouldRenderTooltip(false);

  return (
    <Tooltip
      title={
        isRemoteDisabled
          ? 'Requires Promptfoo Cloud connection'
          : tooltipTitle || 'Generate test case'
      }
      open={shouldRenderTooltip}
      onClose={hideTooltip}
      onOpen={showTooltip}
    >
      <span>
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            hideTooltip();
            onClick();
          }}
          disabled={disabled || isRemoteDisabled}
          sx={{ color: 'text.secondary' }}
          onMouseEnter={showTooltip}
          onMouseLeave={hideTooltip}
        >
          {isGenerating ? (
            <CircularProgress size={size === 'small' ? 16 : 20} />
          ) : (
            <MagicWandIcon fontSize={size} />
          )}
        </IconButton>
      </span>
    </Tooltip>
  );
};

const MultiTurnExtensionControl: React.FC<{
  onContinue: (additionalTurns: number) => void;
}> = ({ onContinue }) => {
  const [additionalTurns, setAdditionalTurns] = React.useState<number>(5);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <BaseNumberInput
        size="small"
        value={additionalTurns}
        onChange={(value) => {
          if (value !== undefined) {
            setAdditionalTurns(Math.max(1, Math.min(100, value)));
          }
        }}
        sx={{ width: 125 }}
        label="Additional Turns"
        min={1}
        max={100}
      />
      <Button onClick={() => onContinue(additionalTurns)} variant="contained" color="primary">
        Continue
      </Button>
    </Box>
  );
};
