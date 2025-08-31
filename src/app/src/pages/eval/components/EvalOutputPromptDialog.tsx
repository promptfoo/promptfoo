import { useEffect, useState } from 'react';
import type React from 'react';

import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EditIcon from '@mui/icons-material/Edit';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
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
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { ErrorBoundary } from 'react-error-boundary';
import { callApi } from '@app/utils/api';
import { ellipsize } from '../../../../../util/text';
import TraceView from '../../../components/traces/TraceView';
import ChatMessages, { type Message } from './ChatMessages';
import Citations from './Citations';
import { useTableStore } from './store';

import type { GradingResult } from './types';

// Common style object for copy buttons
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

// Common typography styles
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

/**
 * Returns the value of the assertion.
 * For context-related assertions, read the context value from metadata, if it exists.
 * Otherwise, return the assertion value.
 * @param result - The grading result.
 * @returns The value of the assertion.
 */
function getValue(result: GradingResult) {
  // For context-related assertions, read the context value from metadata, if it exists
  if (
    result.assertion?.type &&
    ['context-faithfulness', 'context-recall', 'context-relevance'].includes(
      result.assertion.type,
    ) &&
    result.metadata?.context
  ) {
    return result.metadata?.context;
  }

  // Otherwise, return the assertion value
  return result.assertion?.value
    ? typeof result.assertion.value === 'object'
      ? JSON.stringify(result.assertion.value, null, 2)
      : String(result.assertion.value)
    : '-';
}

// Code display component
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

function AssertionResults({ gradingResults }: { gradingResults?: GradingResult[] }) {
  const [expandedValues, setExpandedValues] = useState<{ [key: number]: boolean }>({});
  const [copiedAssertions, setCopiedAssertions] = useState<{ [key: string]: boolean }>({});
  const [hoveredAssertion, setHoveredAssertion] = useState<string | null>(null);

  if (!gradingResults) {
    return null;
  }

  const hasMetrics = gradingResults.some((result) => result?.assertion?.metric);

  const toggleExpand = (index: number) => {
    setExpandedValues((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const copyAssertionToClipboard = async (key: string, text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopiedAssertions((prev) => ({ ...prev, [key]: true }));

    setTimeout(() => {
      setCopiedAssertions((prev) => ({ ...prev, [key]: false }));
    }, 2000);
  };

  return (
    <Box mt={2}>
      <Typography variant="subtitle1" sx={subtitleTypographySx}>
        Assertions
      </Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table>
          <TableHead>
            <TableRow>
              {hasMetrics && <TableCell style={{ fontWeight: 'bold' }}>Metric</TableCell>}
              <TableCell style={{ fontWeight: 'bold' }}>Pass</TableCell>
              <TableCell style={{ fontWeight: 'bold' }}>Score</TableCell>
              <TableCell style={{ fontWeight: 'bold' }}>Type</TableCell>
              <TableCell style={{ fontWeight: 'bold' }}>Value</TableCell>
              <TableCell style={{ fontWeight: 'bold' }}>Reason</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {gradingResults.map((result, i) => {
              if (!result) {
                return null;
              }

              const value = getValue(result);
              const truncatedValue = ellipsize(value, 300);
              const isExpanded = expandedValues[i] || false;
              const valueKey = `value-${i}`;

              return (
                <TableRow key={i}>
                  {hasMetrics && <TableCell>{result.assertion?.metric || ''}</TableCell>}
                  <TableCell>{result.pass ? '✅' : '❌'}</TableCell>
                  <TableCell>{result.score?.toFixed(2)}</TableCell>
                  <TableCell>{result.assertion?.type || ''}</TableCell>
                  <TableCell
                    style={{ whiteSpace: 'pre-wrap', cursor: 'pointer', position: 'relative' }}
                    onClick={() => toggleExpand(i)}
                    onMouseEnter={() => setHoveredAssertion(valueKey)}
                    onMouseLeave={() => setHoveredAssertion(null)}
                  >
                    {isExpanded ? value : truncatedValue}
                    {(hoveredAssertion === valueKey || copiedAssertions[valueKey]) && (
                      <IconButton
                        size="small"
                        onClick={(e) => copyAssertionToClipboard(valueKey, value, e)}
                        sx={copyButtonSx}
                        aria-label={`Copy assertion value ${i}`}
                      >
                        {copiedAssertions[valueKey] ? (
                          <CheckIcon fontSize="small" />
                        ) : (
                          <ContentCopyIcon fontSize="small" />
                        )}
                      </IconButton>
                    )}
                  </TableCell>
                  <TableCell
                    style={{ whiteSpace: 'pre-wrap', position: 'relative' }}
                    onMouseEnter={() => setHoveredAssertion(`reason-${i}`)}
                    onMouseLeave={() => setHoveredAssertion(null)}
                  >
                    {result.reason}
                    {result.reason &&
                      (hoveredAssertion === `reason-${i}` || copiedAssertions[`reason-${i}`]) && (
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyAssertionToClipboard(`reason-${i}`, result.reason || '', e);
                          }}
                          sx={copyButtonSx}
                          aria-label={`Copy assertion reason ${i}`}
                        >
                          {copiedAssertions[`reason-${i}`] ? (
                            <CheckIcon fontSize="small" />
                          ) : (
                            <ContentCopyIcon fontSize="small" />
                          )}
                        </IconButton>
                      )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

interface ExpandedMetadataState {
  [key: string]: {
    expanded: boolean;
    lastClickTime: number;
  };
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
  variables?: Record<string, any>;
}

// URL detection function
const isValidUrl = (str: string): boolean => {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
};

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
  variables,
}: EvalOutputPromptDialogProps) {
  const [copied, setCopied] = useState(false);
  const [copiedFields, setCopiedFields] = useState<{ [key: string]: boolean }>({});
  const [expandedMetadata, setExpandedMetadata] = useState<ExpandedMetadataState>({});
  const [hoveredElement, setHoveredElement] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState(prompt);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayOutput, setReplayOutput] = useState<string | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);
  const { addFilter, resetFilters } = useTableStore();

  useEffect(() => {
    setCopied(false);
    setCopiedFields({});
    setEditMode(false);
    setEditedPrompt(prompt);
    setReplayOutput(null);
    setReplayError(null);
  }, [prompt]);

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };

  const copyFieldToClipboard = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedFields((prev) => ({ ...prev, [key]: true }));

    // Reset copied status after 2 seconds
    setTimeout(() => {
      setCopiedFields((prev) => ({ ...prev, [key]: false }));
    }, 2000);
  };

  const handleReplay = async () => {
    if (!evaluationId || !provider) {
      setReplayError('Missing evaluation ID or provider');
      return;
    }

    setReplayLoading(true);
    setReplayError(null);
    setReplayOutput(null);

    try {
      const response = await callApi('/eval/replay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          evaluationId,
          testIndex,
          prompt: editedPrompt,
          variables,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to replay evaluation');
      }

      const data = await response.json();

      // Handle the response, checking for output in various locations
      if (data.output) {
        setReplayOutput(data.output);
      } else if (data.response?.output) {
        setReplayOutput(data.response.output);
      } else if (data.response?.raw) {
        setReplayOutput(data.response.raw);
      } else if (data.error) {
        setReplayError(`Provider error: ${data.error}`);
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
    // Reset all filters first
    resetFilters();
    // Then apply only this filter
    addFilter({
      type: 'metadata',
      operator,
      value: typeof value === 'string' ? value : JSON.stringify(value),
      field,
    });
    onClose();
  };

  let parsedMessages: Message[] = [];
  try {
    parsedMessages = JSON.parse(metadata?.messages || '[]');
  } catch {}

  // Get citations from metadata if they exist
  const citationsData = metadata?.citations;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>Details{provider && `: ${provider}`}</DialogTitle>
      <DialogContent>
        <Box mb={2}>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
            <Typography variant="subtitle1" sx={subtitleTypographySx}>
              Prompt
            </Typography>
            <Box display="flex" gap={1}>
              {!editMode && (
                <Tooltip title="Edit & Replay">
                  <IconButton
                    size="small"
                    onClick={() => setEditMode(true)}
                    sx={{
                      color: 'text.secondary',
                      '&:hover': {
                        color: 'primary.main',
                      },
                    }}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {editMode && (
                <>
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={replayLoading ? <CircularProgress size={16} /> : <PlayArrowIcon />}
                    onClick={handleReplay}
                    disabled={replayLoading || !editedPrompt.trim()}
                  >
                    Replay
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      setEditMode(false);
                      setEditedPrompt(prompt);
                      setReplayOutput(null);
                      setReplayError(null);
                    }}
                  >
                    Cancel
                  </Button>
                </>
              )}
            </Box>
          </Box>
          {editMode ? (
            <TextField
              fullWidth
              multiline
              variant="outlined"
              value={editedPrompt}
              onChange={(e) => setEditedPrompt(e.target.value)}
              sx={{
                '& .MuiInputBase-root': {
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                },
              }}
              minRows={4}
              maxRows={20}
            />
          ) : (
            <CodeDisplay
              content={prompt}
              title=""
              onCopy={() => copyToClipboard(prompt)}
              copied={copied}
              onMouseEnter={() => setHoveredElement('prompt')}
              onMouseLeave={() => setHoveredElement(null)}
              showCopyButton={hoveredElement === 'prompt' || copied}
            />
          )}
          {replayError && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {replayError}
            </Alert>
          )}
        </Box>
        {metadata?.redteamFinalPrompt && (
          <CodeDisplay
            content={metadata.redteamFinalPrompt}
            title="Modified User Input (Red Team)"
            onCopy={() => copyFieldToClipboard('redteamFinalPrompt', metadata.redteamFinalPrompt)}
            copied={copiedFields['redteamFinalPrompt'] || false}
            onMouseEnter={() => setHoveredElement('redteamFinalPrompt')}
            onMouseLeave={() => setHoveredElement(null)}
            showCopyButton={
              hoveredElement === 'redteamFinalPrompt' || copiedFields['redteamFinalPrompt']
            }
          />
        )}
        {replayOutput && (
          <CodeDisplay
            content={replayOutput}
            title="Replay Output"
            onCopy={() => copyFieldToClipboard('replayOutput', replayOutput)}
            copied={copiedFields['replayOutput'] || false}
            onMouseEnter={() => setHoveredElement('replayOutput')}
            onMouseLeave={() => setHoveredElement(null)}
            showCopyButton={hoveredElement === 'replayOutput' || copiedFields['replayOutput']}
          />
        )}
        {output && (
          <CodeDisplay
            content={output}
            title="Original Output"
            onCopy={() => copyFieldToClipboard('output', output)}
            copied={copiedFields['output'] || false}
            onMouseEnter={() => setHoveredElement('output')}
            onMouseLeave={() => setHoveredElement(null)}
            showCopyButton={hoveredElement === 'output' || copiedFields['output']}
          />
        )}
        <AssertionResults gradingResults={gradingResults} />
        {parsedMessages && parsedMessages.length > 0 && <ChatMessages messages={parsedMessages} />}
        {evaluationId && (
          <Box mt={2}>
            <Typography variant="subtitle1" sx={subtitleTypographySx}>
              Trace Timeline
            </Typography>
            <ErrorBoundary fallback={<Alert severity="error">Error loading traces</Alert>}>
              <TraceView evaluationId={evaluationId} testCaseId={testCaseId} />
            </ErrorBoundary>
          </Box>
        )}
        {citationsData && <Citations citations={citationsData} />}
        {metadata && Object.keys(metadata).filter((key) => key !== 'citations').length > 0 && (
          <Box my={2}>
            <Typography variant="subtitle1" sx={subtitleTypographySx}>
              Metadata
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>
                      <strong>Key</strong>
                    </TableCell>
                    <TableCell>
                      <strong>Value</strong>
                    </TableCell>
                    <TableCell width={80} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {Object.entries(metadata).map(([key, value]) => {
                    // Skip citations in metadata display as they're shown in their own component
                    if (key === 'citations') {
                      return null;
                    }

                    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
                    const truncatedValue = ellipsize(stringValue, 300);
                    const isUrl = typeof value === 'string' && isValidUrl(value);

                    return (
                      <TableRow key={key}>
                        <TableCell>{key}</TableCell>
                        <TableCell
                          style={{
                            whiteSpace: 'pre-wrap',
                            cursor: isUrl ? 'auto' : 'pointer',
                          }}
                          onClick={() => !isUrl && handleMetadataClick(key)}
                        >
                          {isUrl ? (
                            <Link href={value} target="_blank" rel="noopener noreferrer">
                              {expandedMetadata[key]?.expanded ? stringValue : truncatedValue}
                            </Link>
                          ) : expandedMetadata[key]?.expanded ? (
                            stringValue
                          ) : (
                            truncatedValue
                          )}
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <Tooltip title="Copy value">
                              <IconButton
                                size="small"
                                onClick={() => copyFieldToClipboard(key, stringValue)}
                                sx={{
                                  color: 'text.disabled',
                                  transition: 'color 0.2s ease',
                                  '&:hover': {
                                    color: 'text.secondary',
                                  },
                                }}
                                aria-label={`Copy metadata value for ${key}`}
                              >
                                {copiedFields[key] ? (
                                  <CheckIcon fontSize="small" />
                                ) : (
                                  <ContentCopyIcon fontSize="small" />
                                )}
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Filter by value (replaces existing filters)">
                              <IconButton
                                size="small"
                                onClick={() => handleApplyFilter(key, stringValue)}
                                sx={{
                                  color: 'text.disabled',
                                  transition: 'color 0.2s ease',
                                  '&:hover': {
                                    color: 'text.secondary',
                                  },
                                }}
                                aria-label={`Filter by ${key}`}
                              >
                                <FilterAltIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
        {(metadata?.redteamHistory || metadata?.redteamTreeHistory) && (
          <Box mt={2} mb={3}>
            <ChatMessages
              title="Attempts"
              messages={(metadata?.redteamHistory ?? metadata?.redteamTreeHistory ?? [])
                .filter((entry: any) => entry?.prompt && entry?.output)
                .flatMap(
                  (entry: {
                    prompt: string;
                    output: string;
                    score?: number;
                    isOnTopic?: boolean;
                    graderPassed?: boolean;
                  }) => [
                    {
                      role: 'user' as const,
                      content: entry.prompt,
                    },
                    {
                      role: 'assistant' as const,
                      content: entry.output,
                    },
                  ],
                )}
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
