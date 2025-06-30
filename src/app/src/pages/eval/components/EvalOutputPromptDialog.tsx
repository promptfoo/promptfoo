import React, { useState, useEffect } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
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
import Typography from '@mui/material/Typography';
import { ellipsize } from '../../../../../util/text';
import TraceView from '../../../components/traces/TraceView';
import ChatMessages, { type Message } from './ChatMessages';
import Citations from './Citations';
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
    /^[\s]*[{\[]/.test(content) || // JSON-like (starts with { or [)
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
              const value = result.assertion?.value
                ? typeof result.assertion.value === 'object'
                  ? JSON.stringify(result.assertion.value, null, 2)
                  : String(result.assertion.value)
                : '-';
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
}: EvalOutputPromptDialogProps) {
  const [copied, setCopied] = useState(false);
  const [copiedFields, setCopiedFields] = useState<{ [key: string]: boolean }>({});
  const [expandedMetadata, setExpandedMetadata] = useState<ExpandedMetadataState>({});
  const [hoveredElement, setHoveredElement] = useState<string | null>(null);

  useEffect(() => {
    setCopied(false);
    setCopiedFields({});
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

  const handleMetadataClick = (key: string) => {
    const now = Date.now();
    const lastClick = expandedMetadata[key]?.lastClickTime || 0;
    const isDoubleClick = now - lastClick < 300; // 300ms threshold

    setExpandedMetadata((prev: ExpandedMetadataState) => ({
      ...prev,
      [key]: {
        expanded: isDoubleClick ? false : true,
        lastClickTime: now,
      },
    }));
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
        <CodeDisplay
          content={prompt}
          title="Prompt"
          onCopy={() => copyToClipboard(prompt)}
          copied={copied}
          onMouseEnter={() => setHoveredElement('prompt')}
          onMouseLeave={() => setHoveredElement(null)}
          showCopyButton={hoveredElement === 'prompt' || copied}
        />
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
        {output && (
          <CodeDisplay
            content={output}
            title="Output"
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
                            position: 'relative',
                          }}
                          onClick={() => !isUrl && handleMetadataClick(key)}
                          onMouseEnter={() => setHoveredElement(`metadata-${key}`)}
                          onMouseLeave={() => setHoveredElement(null)}
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
                          {(hoveredElement === `metadata-${key}` || copiedFields[key]) && (
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyFieldToClipboard(key, stringValue);
                              }}
                              sx={copyButtonSx}
                              aria-label={`Copy metadata value for ${key}`}
                            >
                              {copiedFields[key] ? (
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
