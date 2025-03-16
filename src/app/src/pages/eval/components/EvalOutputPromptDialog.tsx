import { useState, useEffect } from 'react';
import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextareaAutosize from '@mui/material/TextareaAutosize';
import Typography from '@mui/material/Typography';
import { ellipsize } from '../../../../../util/text';
import ChatMessages, { type Message } from './ChatMessages';
import type { GradingResult } from './types';

// Common style object for copy buttons
const copyButtonSx = {
  position: 'absolute',
  right: '8px',
  top: '4px',
  bgcolor: 'rgba(255, 255, 255, 0.7)',
};

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
      <Typography variant="subtitle1">Assertions</Typography>
      <TableContainer>
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
}

export default function EvalOutputPromptDialog({
  open,
  onClose,
  prompt,
  provider,
  output,
  gradingResults,
  metadata,
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

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>Details{provider && `: ${provider}`}</DialogTitle>
      <DialogContent>
        <Box
          mb={2}
          position="relative"
          onMouseEnter={() => setHoveredElement('prompt')}
          onMouseLeave={() => setHoveredElement(null)}
        >
          <Typography variant="subtitle1" style={{ marginBottom: '1rem' }}>
            Prompt
          </Typography>
          <div style={{ position: 'relative' }}>
            <TextareaAutosize
              readOnly
              value={prompt}
              style={{ width: '100%', padding: '0.75rem' }}
              maxRows={20}
            />
            {(hoveredElement === 'prompt' || copied) && (
              <IconButton
                onClick={() => copyToClipboard(prompt)}
                sx={copyButtonSx}
                size="small"
                aria-label="Copy prompt"
              >
                {copied ? <CheckIcon /> : <ContentCopyIcon />}
              </IconButton>
            )}
          </div>
        </Box>
        {metadata?.redteamFinalPrompt && (
          <Box
            my={2}
            position="relative"
            onMouseEnter={() => setHoveredElement('redteamFinalPrompt')}
            onMouseLeave={() => setHoveredElement(null)}
          >
            <Typography variant="subtitle1" style={{ marginBottom: '1rem', marginTop: '1rem' }}>
              Modified User Input (Red Team)
            </Typography>
            <div style={{ position: 'relative' }}>
              <TextareaAutosize
                readOnly
                maxRows={20}
                value={metadata.redteamFinalPrompt}
                style={{ width: '100%', padding: '0.75rem' }}
              />
              {(hoveredElement === 'redteamFinalPrompt' || copiedFields['redteamFinalPrompt']) && (
                <IconButton
                  onClick={() =>
                    copyFieldToClipboard('redteamFinalPrompt', metadata.redteamFinalPrompt)
                  }
                  sx={{
                    ...copyButtonSx,
                    top: '8px',
                  }}
                  size="small"
                  aria-label="Copy modified user input"
                >
                  {copiedFields['redteamFinalPrompt'] ? <CheckIcon /> : <ContentCopyIcon />}
                </IconButton>
              )}
            </div>
          </Box>
        )}
        {output && (
          <Box
            my={2}
            position="relative"
            onMouseEnter={() => setHoveredElement('output')}
            onMouseLeave={() => setHoveredElement(null)}
          >
            <Typography variant="subtitle1" style={{ marginBottom: '1rem', marginTop: '1rem' }}>
              Output
            </Typography>
            <div style={{ position: 'relative' }}>
              <TextareaAutosize
                readOnly
                maxRows={20}
                value={output}
                style={{ width: '100%', padding: '0.75rem' }}
              />
              {(hoveredElement === 'output' || copiedFields['output']) && (
                <IconButton
                  onClick={() => copyFieldToClipboard('output', output)}
                  sx={{
                    ...copyButtonSx,
                    top: '8px',
                  }}
                  size="small"
                  aria-label="Copy output"
                >
                  {copiedFields['output'] ? <CheckIcon /> : <ContentCopyIcon />}
                </IconButton>
              )}
            </div>
          </Box>
        )}
        <AssertionResults gradingResults={gradingResults} />
        {parsedMessages && parsedMessages.length > 0 && <ChatMessages messages={parsedMessages} />}
        {metadata && Object.keys(metadata).length > 0 && (
          <Box my={2}>
            <Typography variant="subtitle1" style={{ marginBottom: '1rem', marginTop: '1rem' }}>
              Metadata
            </Typography>
            <TableContainer>
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
                    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
                    const truncatedValue = ellipsize(stringValue, 300);

                    return (
                      <TableRow key={key}>
                        <TableCell>{key}</TableCell>
                        <TableCell
                          style={{
                            whiteSpace: 'pre-wrap',
                            cursor: 'pointer',
                            position: 'relative',
                          }}
                          onClick={() => handleMetadataClick(key)}
                          onMouseEnter={() => setHoveredElement(`metadata-${key}`)}
                          onMouseLeave={() => setHoveredElement(null)}
                        >
                          {expandedMetadata[key]?.expanded ? stringValue : truncatedValue}
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
