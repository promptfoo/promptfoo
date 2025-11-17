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
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import {
  categoryAliases,
  displayNameOverrides,
  isMultiTurnStrategy,
  type Plugin,
  type Strategy,
} from '@promptfoo/redteam/constants';
import {
  getPluginDocumentationUrl,
  hasSpecificPluginDocumentation,
} from './pluginDocumentationMap';
import { useApiHealth } from '@app/hooks/useApiHealth';
import Skeleton from '@mui/material/Skeleton';
import Chip from '@mui/material/Chip';
import ChatMessages, { type Message as ChatMessage } from '@app/pages/eval/components/ChatMessages';

type GeneratedTestCase = {
  prompt: string;
  context?: string;
  metadata?: any;
};

interface TestCaseDialogProps {
  open: boolean;
  onClose: () => void;
  plugin: Plugin | null;
  strategy: Strategy | null;
  isGenerating: boolean;
  generatedTestCase: GeneratedTestCase | null;
  targetResponse?: { output: string; error?: string } | null;
  isRunningTest?: boolean;
  onRegenerate: () => void;
}

const Section = ({
  label,
  text,
  loading,
  strategy,
}: {
  label: string;
  text: string;
  loading: boolean;
  strategy: Strategy | null;
}) => {
  const theme = useTheme();

  const content = useMemo(() => {
    if (strategy === 'audio') {
      return (
        <Box>
          <audio controls style={{ width: '100%' }} data-testid="audio-player">
            <source src={`data:audio/wav;base64,${text}`} type="audio/wav" />
            Your browser does not support the audio element.
          </audio>
        </Box>
      );
    } else if (strategy === 'image') {
      return (
        <Box
          sx={{
            p: 2,
            borderRadius: 1,
            border: '1px solid',
            borderColor: theme.palette.mode === 'dark' ? 'grey.700' : 'grey.300',
          }}
        >
          <img src={`data:image/png;base64,${text}`} alt="Image" />
        </Box>
      );
    } else if (strategy === 'video') {
      return (
        <Box sx={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
          <video controls style={{ maxHeight: '200px' }}>
            <source
              src={text.startsWith('data:') ? text : `data:video/mp4;base64,${text}`}
              type="video/mp4"
            />
            Your browser does not support the video element.
          </video>
        </Box>
      );
    } else {
      return (
        <Box
          sx={{
            p: 2,
            borderRadius: 1,
            border: '1px solid',
            borderColor: theme.palette.mode === 'dark' ? 'grey.700' : 'grey.300',
            backgroundColor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
            minHeight: 51,
          }}
        >
          {text}
        </Box>
      );
    }
  }, [text, strategy]);

  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom>
        {label}
      </Typography>
      <Box
        sx={{
          fontFamily: 'monospace',
          fontSize: '0.875rem',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {loading ? (
          <Skeleton variant="rectangular" sx={{ p: 2, borderRadius: 1, height: 51 }} />
        ) : (
          content
        )}
      </Box>
    </Box>
  );
};

export const TestCaseDialog: React.FC<TestCaseDialogProps> = ({
  open,
  onClose,
  plugin,
  strategy,
  isGenerating,
  generatedTestCase,
  targetResponse,
  isRunningTest = false,
  onRegenerate,
}) => {
  const pluginName = typeof plugin === 'string' ? plugin : plugin || '';
  const pluginDisplayName =
    displayNameOverrides[pluginName as Plugin] ||
    categoryAliases[pluginName as Plugin] ||
    pluginName;

  const strategyName = typeof strategy === 'string' ? strategy : strategy || '';
  const strategyDisplayName = displayNameOverrides[strategyName as Strategy] || strategyName;
  const strategyIsMultiTurn =
    typeof strategyName === 'string' && strategyName
      ? isMultiTurnStrategy(strategyName as Strategy)
      : false;

  const turnMessages = useMemo<ChatMessage[]>(() => {
    const metadata = (generatedTestCase as { metadata?: any } | null)?.metadata;
    const historyCandidate =
      metadata?.multiTurn?.history ||
      metadata?.metadata?.multiTurn?.history ||
      metadata?.redteamHistory ||
      [];

    if (!Array.isArray(historyCandidate)) {
      return [];
    }

    return historyCandidate
      .filter((entry: any) => entry && typeof entry.content === 'string')
      .map((entry: any, idx: number) => {
        const role =
          entry.role === 'assistant' || entry.role === 'user' || entry.role === 'system'
            ? (entry.role as ChatMessage['role'])
            : idx % 2 === 0
              ? 'user'
              : 'assistant';
        return {
          role,
          content: entry.content as string,
        };
      });
  }, [generatedTestCase]);

  const isMultiTurnConversation = turnMessages.length > 0;
  const promptText = generatedTestCase?.prompt?.toString() ?? '';
  const targetOutputText = targetResponse?.output?.toString() ?? '';

  const shouldShowPromptSection = !strategyIsMultiTurn && (isGenerating || promptText);
  const shouldShowTargetSection =
    !strategyIsMultiTurn && (isRunningTest || targetOutputText || targetResponse?.error);

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
    >
      <DialogTitle
        sx={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Typography variant="h6">Test Case</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Chip label={`Strategy: ${strategyDisplayName}`} />
          <Chip label={`Plugin: ${pluginDisplayName}`} />
        </Box>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {strategyIsMultiTurn && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Turns
            </Typography>
            <Box sx={{ maxHeight: 280, overflowY: 'auto' }}>
              {isMultiTurnConversation ? (
                <ChatMessages messages={turnMessages} />
              ) : (
                <Skeleton
                  variant="rectangular"
                  sx={{ p: 2, borderRadius: 1, height: 120 }}
                  animation="pulse"
                />
              )}
            </Box>
          </Box>
        )}

        {!strategyIsMultiTurn && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {shouldShowPromptSection && (
              <Section
                label="Generated Prompt"
                text={promptText || 'Awaiting generation...'}
                loading={isGenerating}
                strategy={strategy}
              />
            )}
            {shouldShowTargetSection && (
              <Section
                label="Target Response"
                text={targetOutputText || (targetResponse?.error ?? 'No response')}
                loading={isRunningTest}
                strategy={strategy}
              />
            )}
            {targetResponse?.error && <Alert severity="error">{targetResponse.error}</Alert>}
          </Box>
        )}

        <Alert severity="info" sx={{ mt: 2 }}>
          Dissatisfied with the test case? Fine tune it by adjusting your{' '}
          {pluginName === 'policy' ? 'Policy details' : 'Application Details'}.
        </Alert>
      </DialogContent>
      <DialogActions>
        {pluginName && hasSpecificPluginDocumentation(pluginName as Plugin) && (
          <Box sx={{ flex: 1, mr: 2 }}>
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
                paddingLeft: 2,
              }}
            >
              Learn more about {pluginDisplayName}
              <Box component="span" sx={{ fontSize: '0.75rem' }}>
                ↗
              </Box>
            </Link>
          </Box>
        )}
        <Button onClick={onRegenerate} variant="contained" loading={isGenerating || isRunningTest}>
          Regenerate
        </Button>
        <Button onClick={onClose} variant="outlined">
          Close
        </Button>
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
