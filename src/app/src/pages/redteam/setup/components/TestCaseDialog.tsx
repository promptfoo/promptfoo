import React, { useMemo } from 'react';

import MagicWandIcon from '@mui/icons-material/AutoFixHigh';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Tooltip from '@mui/material/Tooltip';
import Divider from '@mui/material/Divider';
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
import Skeleton from '@mui/material/Skeleton';
import Chip from '@mui/material/Chip';
import ChatMessages, {
  type LoadedMessage,
  type LoadingMessage,
  type Message,
} from '@app/pages/eval/components/ChatMessages';
import { type GeneratedTestCase, type TargetResponse } from './TestCaseGenerationProvider';

interface TestCaseDialogProps {
  open: boolean;
  onClose: () => void;
  plugin: Plugin | null;
  strategy: Strategy | null;
  isGenerating: boolean;
  generatedTestCases: GeneratedTestCase[];
  targetResponses: TargetResponse[];
  isRunningTest?: boolean;
  onRegenerate: () => void;
  onContinue: (additionalTurns: number) => void;
  currentTurn: number;
  maxTurns: number;
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
}) => {
  const pluginName = typeof plugin === 'string' ? plugin : plugin || '';
  const pluginDisplayName =
    displayNameOverrides[pluginName as Plugin] ||
    categoryAliases[pluginName as Plugin] ||
    pluginName;

  const strategyName = typeof strategy === 'string' ? strategy : strategy || '';
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
            strategy === 'audio'
              ? ('audio' as const)
              : strategy === 'image'
                ? ('image' as const)
                : strategy === 'video'
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
    if (isGenerating && generatedTestCases.length === targetResponses.length) {
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
    strategy,
  ]);

  const canAddAdditionalTurns =
    !isGenerating && !isRunningTest && isMultiTurnStrategy(strategy as Strategy);

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
          <Chip label={`Plugin: ${pluginDisplayName}`} data-testid="plugin-chip" />
        </Box>
      </Box>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <ChatMessages messages={turnMessages} displayTurnCount={maxTurns > 1} maxTurns={maxTurns} />

        <div />

        {generatedTestCases.length > 0 && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Dissatisfied with the test case? Fine tune it by adjusting your{' '}
            {pluginName === 'policy' ? 'Policy details' : 'Application Details'}.
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {pluginName && hasSpecificPluginDocumentation(pluginName as Plugin) && (
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
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          {canAddAdditionalTurns && (
            <>
              <MultiTurnExtensionControl onContinue={onContinue} />{' '}
              <Divider orientation="vertical" flexItem />
            </>
          )}
          <Button
            onClick={onRegenerate}
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

  return (
    <Tooltip
      title={
        isRemoteDisabled
          ? 'Requires Promptfoo Cloud connection'
          : tooltipTitle || 'Generate test case'
      }
    >
      <span>
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          disabled={disabled || isRemoteDisabled}
          sx={{ color: 'text.secondary' }}
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
