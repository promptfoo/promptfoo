import type React from 'react';
import { useEffect, useMemo, useState } from 'react';

import { HIDDEN_METADATA_KEYS } from '@app/constants';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import type { GradingResult } from '@promptfoo/types';

import type { Trace } from '../../../components/traces/TraceView';
import type { CloudConfigData } from '../../../hooks/useCloudConfig';
import ChatMessages, { type Message } from './ChatMessages';
import { DebuggingPanel } from './DebuggingPanel';
import { EvaluationPanel } from './EvaluationPanel';
import { type ExpandedMetadataState, MetadataPanel } from './MetadataPanel';
import { OutputsPanel } from './OutputsPanel';
import { PromptEditor } from './PromptEditor';
import type { ResultsFilterOperator, ResultsFilterType } from './store';

const copyButtonSx = {
  position: 'absolute',
  right: '8px',
  top: '8px',
  bgcolor: 'background.paper',
  boxShadow: 1,
  '&:hover': {
    bgcolor: 'action.hover',
    boxShadow: 2,
  },
};

const subtitleTypographySx = {
  mb: 1,
  fontWeight: 500,
};

const textContentTypographySx = {
  fontSize: '0.875rem',
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

interface CodeDisplayProps {
  content: string;
  title: string;
  maxHeight?: string | number;
  onCopy: () => void;
  copied: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  showCopyButton?: boolean;
}

function CodeDisplay({
  content,
  title,
  maxHeight = 400,
  onCopy,
  copied,
  onMouseEnter,
  onMouseLeave,
  showCopyButton = false,
}: CodeDisplayProps) {
  // Improved code detection logic
  const isCode =
    /^[\s]*[{[]/.test(content) || // JSON-like (starts with { or [)
    /^#\s/.test(content) || // Markdown headers (starts with # )
    /```/.test(content) || // Code blocks (contains ```)
    /^\s*[\w-]+\s*:/.test(content) || // YAML/config-like (key: value)
    /^\s*<\w+/.test(content) || // XML/HTML-like (starts with <tag)
    content.includes('function ') || // JavaScript functions
    content.includes('class ') || // Class definitions
    content.includes('import ') || // Import statements
    /^\s*def\s+/.test(content) || // Python functions
    /^\s*\w+\s*\(/.test(content); // Function calls

  return (
    <Box mb={2}>
      <Typography variant="subtitle1" sx={subtitleTypographySx}>
        {title}
      </Typography>
      <Paper
        variant="outlined"
        sx={{
          position: 'relative',
          bgcolor: 'background.default',
          borderRadius: 1,
          overflow: 'hidden',
          '&:hover': {
            borderColor: 'primary.main',
            bgcolor: 'action.hover',
          },
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <Box
          sx={{
            p: 2,
            overflowX: 'auto',
            overflowY: 'auto',
            maxHeight,
          }}
        >
          {isCode ? (
            <pre
              style={{
                margin: 0,
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {content}
            </pre>
          ) : (
            <Typography variant="body1" sx={textContentTypographySx}>
              {content}
            </Typography>
          )}
        </Box>
        {showCopyButton && (
          <IconButton
            size="small"
            onClick={onCopy}
            sx={copyButtonSx}
            aria-label={`Copy ${title.toLowerCase()}`}
          >
            {copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
          </IconButton>
        )}
      </Paper>
    </Box>
  );
}

/**
 * Parameters for replaying an evaluation with a modified prompt.
 */
export interface ReplayEvaluationParams {
  evaluationId: string;
  testIndex?: number;
  prompt: string;
  variables?: Record<string, any>;
}

/**
 * Result from replaying an evaluation.
 */
export interface ReplayEvaluationResult {
  output?: string;
  error?: string;
}

/**
 * Filter configuration for table filtering.
 */
export interface FilterConfig {
  type: ResultsFilterType;
  operator: ResultsFilterOperator;
  value: string;
  field?: string;
}

interface EvalOutputPromptDialogProps {
  open: boolean;
  onClose: () => void;
  prompt: string;
  provider?: string;
  output?: string;
  gradingResults?: GradingResult[];
  metadata?: Record<string, any>;
  evaluationId?: string;
  testCaseId?: string;
  testIndex?: number;
  promptIndex?: number;
  variables?: Record<string, any>;
  onAddFilter?: (filter: FilterConfig) => void;
  onResetFilters?: () => void;
  onReplay?: (params: ReplayEvaluationParams) => Promise<ReplayEvaluationResult>;
  fetchTraces?: (evaluationId: string, signal: AbortSignal) => Promise<Trace[]>;
  cloudConfig?: CloudConfigData | null;
  readOnly?: boolean;
}

export default function EvalOutputPromptDialog({
  open,
  onClose,
  prompt,
  provider,
  output,
  gradingResults,
  metadata,
  evaluationId,
  testCaseId,
  testIndex,
  promptIndex,
  variables,
  onAddFilter,
  onResetFilters,
  onReplay,
  fetchTraces,
  cloudConfig,
  readOnly = false,
}: EvalOutputPromptDialogProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [copied, setCopied] = useState(false);
  const [copiedFields, setCopiedFields] = useState<{ [key: string]: boolean }>({});
  const [expandedMetadata, setExpandedMetadata] = useState<ExpandedMetadataState>({});
  const [hoveredElement, setHoveredElement] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState(prompt);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayOutput, setReplayOutput] = useState<string | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [traces, setTraces] = useState<Trace[]>([]);

  useEffect(() => {
    setCopied(false);
    setCopiedFields({});
    setEditMode(false);
    setEditedPrompt(prompt);
    setReplayOutput(null);
    setReplayError(null);
    setActiveTab(0); // Reset to first tab when dialog opens
  }, [prompt]);

  // Fetch traces once when evaluationId changes
  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();

    const loadTraces = async () => {
      if (!evaluationId || !fetchTraces) {
        setTraces([]);
        return;
      }

      try {
        const fetchedTraces = await fetchTraces(evaluationId, controller.signal);
        if (isActive) {
          setTraces(fetchedTraces || []);
        }
      } catch (error) {
        if (isActive && (error as Error).name !== 'AbortError') {
          setTraces([]);
        }
      }
    };

    loadTraces();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [evaluationId, fetchTraces]);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };

  const copyFieldToClipboard = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedFields((prev) => ({ ...prev, [key]: true }));

    setTimeout(() => {
      setCopiedFields((prev) => ({ ...prev, [key]: false }));
    }, 2000);
  };

  const handleReplay = async () => {
    if (!evaluationId || !provider) {
      setReplayError('Missing evaluation ID or provider');
      return;
    }

    if (!onReplay) {
      setReplayError('Replay functionality is not available');
      return;
    }

    setReplayLoading(true);
    setReplayError(null);
    setReplayOutput(null);

    try {
      const result = await onReplay({
        evaluationId,
        testIndex,
        prompt: editedPrompt,
        variables,
      });

      if (result.error) {
        setReplayError(result.error);
      } else if (result.output) {
        setReplayOutput(result.output);
      } else {
        setReplayOutput('(No output returned)');
      }
    } catch (error) {
      setReplayError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setReplayLoading(false);
    }
  };

  const handleMetadataClick = (key: string) => {
    const now = Date.now();
    const lastClick = expandedMetadata[key]?.lastClickTime || 0;
    const isDoubleClick = now - lastClick < 300; // 300ms threshold

    setExpandedMetadata((prev: ExpandedMetadataState) => ({
      ...prev,
      [key]: {
        expanded: !isDoubleClick,
        lastClickTime: now,
      },
    }));
  };

  const handleApplyFilter = (
    field: string,
    value: string,
    operator: 'equals' | 'contains' = 'equals',
  ) => {
    onResetFilters?.();
    onAddFilter?.({
      type: 'metadata',
      operator,
      value: typeof value === 'string' ? value : JSON.stringify(value),
      field,
    });
    onClose();
  };

  const handleCancel = () => {
    setEditedPrompt(prompt);
    setReplayOutput(null);
    setReplayError(null);
  };

  let parsedMessages: Message[] = [];
  try {
    parsedMessages = JSON.parse(metadata?.messages || '[]');
  } catch {}

  const citationsData = metadata?.citations;

  const hasOutputContent = Boolean(
    output || replayOutput || metadata?.redteamFinalPrompt || citationsData,
  );

  const redteamHistoryMessages = (metadata?.redteamHistory || metadata?.redteamTreeHistory || [])
    .filter((entry: any) => entry?.prompt && entry?.output)
    .flatMap(
      (entry: {
        prompt: string;
        promptAudio?: { data?: string; format?: string };
        promptImage?: { data?: string; format?: string };
        output: string;
        outputAudio?: { data?: string; format?: string };
        outputImage?: { data?: string; format?: string };
        score?: number;
        graderPassed?: boolean;
      }) => [
        {
          role: 'user' as const,
          content: entry.prompt,
          audio: entry.promptAudio,
          image: entry.promptImage,
        },
        {
          role: 'assistant' as const,
          content: entry.output,
          audio: entry.outputAudio,
          image: entry.outputImage,
        },
      ],
    );

  const hasEvaluationData = gradingResults && gradingResults.length > 0;
  const hasMessagesData = parsedMessages.length > 0 || redteamHistoryMessages.length > 0;
  const hasMetadata =
    metadata &&
    Object.keys(metadata).filter((key) => !HIDDEN_METADATA_KEYS.includes(key)).length > 0;

  const visibleTabs: string[] = ['prompt-output'];
  if (hasEvaluationData) {
    visibleTabs.push('evaluation');
  }
  if (hasMessagesData) {
    visibleTabs.push('messages');
  }
  if (hasMetadata) {
    visibleTabs.push('metadata');
  }

  // Show traces tab only when there's actual trace data
  const hasTracesData = traces.length > 0;

  if (hasTracesData) {
    visibleTabs.push('traces');
  }

  const finalTabName = visibleTabs[activeTab] || 'prompt-output';

  const drawerTransitionDuration = useMemo(() => ({ enter: 320, exit: 250 }), []);
  const drawerSlotProps = useMemo(
    () => ({
      transition: {
        appear: true,
      },
    }),
    [],
  );

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      transitionDuration={drawerTransitionDuration}
      slotProps={drawerSlotProps}
      sx={{
        '& .MuiDrawer-paper': {
          width: { xs: '100%', sm: '85%', md: '85%', lg: '85%' },
          //maxWidth: '1200px',
          boxSizing: 'border-box',
        },
      }}
    >
      {/* Header with title and close button */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 2,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="h6">Details{provider && `: ${provider}`}</Typography>
        <IconButton edge="end" onClick={onClose} aria-label="close" sx={{ ml: 2 }}>
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Main content area */}
      <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 65px)' }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            px: 2,
            flexShrink: 0,
          }}
        >
          <Tab label={hasOutputContent ? 'Prompt & Output' : 'Prompt'} />
          {hasEvaluationData && <Tab label="Evaluation" />}
          {hasMessagesData && <Tab label="Messages" />}
          {hasMetadata && <Tab label="Metadata" />}
          {hasTracesData && <Tab label="Traces" />}
        </Tabs>

        {/* Tab Panels Container */}
        <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
          {/* Prompt & Output Panel */}
          {finalTabName === 'prompt-output' && (
            <Box>
              <PromptEditor
                prompt={prompt}
                editMode={editMode}
                editedPrompt={editedPrompt}
                replayLoading={replayLoading}
                replayError={replayError}
                onEditModeChange={setEditMode}
                onPromptChange={setEditedPrompt}
                onReplay={handleReplay}
                onCancel={handleCancel}
                onCopy={() => copyToClipboard(prompt)}
                copied={copied}
                hoveredElement={hoveredElement}
                onMouseEnter={setHoveredElement}
                onMouseLeave={() => setHoveredElement(null)}
                CodeDisplay={CodeDisplay}
                subtitleTypographySx={subtitleTypographySx}
                readOnly={readOnly}
              />
              {hasOutputContent && (
                <OutputsPanel
                  output={output}
                  replayOutput={replayOutput}
                  redteamFinalPrompt={metadata?.redteamFinalPrompt}
                  copiedFields={copiedFields}
                  hoveredElement={hoveredElement}
                  onCopy={copyFieldToClipboard}
                  onMouseEnter={setHoveredElement}
                  onMouseLeave={() => setHoveredElement(null)}
                  CodeDisplay={CodeDisplay}
                  citations={citationsData}
                />
              )}
            </Box>
          )}

          {/* Evaluation Panel */}
          {finalTabName === 'evaluation' && (
            <Box>
              <EvaluationPanel gradingResults={gradingResults} />
            </Box>
          )}

          {/* Messages Panel */}
          {finalTabName === 'messages' && (
            <Box>
              {parsedMessages.length > 0 && <ChatMessages messages={parsedMessages} />}
              {redteamHistoryMessages.length > 0 && (
                <Box mt={parsedMessages.length > 0 ? 3 : 0}>
                  <ChatMessages messages={redteamHistoryMessages} />
                </Box>
              )}
            </Box>
          )}

          {/* Metadata Panel */}
          {finalTabName === 'metadata' && (
            <Box>
              <MetadataPanel
                metadata={metadata}
                expandedMetadata={expandedMetadata}
                copiedFields={copiedFields}
                onMetadataClick={handleMetadataClick}
                onCopy={copyFieldToClipboard}
                onApplyFilter={handleApplyFilter}
                cloudConfig={cloudConfig}
              />
            </Box>
          )}

          {/* Traces Panel */}
          {finalTabName === 'traces' && (
            <Box>
              <DebuggingPanel
                evaluationId={evaluationId}
                testCaseId={testCaseId}
                testIndex={testIndex}
                promptIndex={promptIndex}
                traces={traces}
              />
            </Box>
          )}
        </Box>
      </Box>
    </Drawer>
  );
}
