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

function AssertionResults({ gradingResults }: { gradingResults?: GradingResult[] }) {
  const [expandedValues, setExpandedValues] = useState<{ [key: number]: boolean }>({});

  if (!gradingResults) {
    return null;
  }

  const hasMetrics = gradingResults.some((result) => result?.assertion?.metric);

  const toggleExpand = (index: number) => {
    setExpandedValues((prev) => ({ ...prev, [index]: !prev[index] }));
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

              return (
                <TableRow key={i}>
                  {hasMetrics && <TableCell>{result.assertion?.metric || ''}</TableCell>}
                  <TableCell>{result.pass ? '✅' : '❌'}</TableCell>
                  <TableCell>{result.score?.toFixed(2)}</TableCell>
                  <TableCell>{result.assertion?.type || ''}</TableCell>
                  <TableCell
                    style={{ whiteSpace: 'pre-wrap', cursor: 'pointer' }}
                    onClick={() => toggleExpand(i)}
                  >
                    {isExpanded ? value : truncatedValue}
                  </TableCell>
                  <TableCell style={{ whiteSpace: 'pre-wrap' }}>{result.reason}</TableCell>
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
  reasoning?: string | any;
  gradingResults?: GradingResult[];
  metadata?: Record<string, any>;
}

export default function EvalOutputPromptDialog({
  open,
  onClose,
  prompt,
  provider,
  output,
  reasoning,
  gradingResults,
  metadata,
}: EvalOutputPromptDialogProps) {
  const [metadataState, setMetadataState] = useState<ExpandedMetadataState>({});
  const [copyStates, setCopyStates] = useState({
    output: false,
    reasoning: false,
    prompt: false,
  });

  useEffect(() => {
    if (prompt) {
      // Parse the prompt into chat messages if it appears to be in chat format
      // ... existing code ...
    }
  }, [prompt]);

  const copyToClipboard = async (text: string, type: 'output' | 'reasoning' | 'prompt') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStates((prev) => ({ ...prev, [type]: true }));
      setTimeout(() => {
        setCopyStates((prev) => ({ ...prev, [type]: false }));
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleMetadataClick = (key: string) => {
    const now = Date.now();
    const lastClick = metadataState[key]?.lastClickTime || 0;
    const isDoubleClick = now - lastClick < 300; // 300ms threshold

    setMetadataState((prev: ExpandedMetadataState) => ({
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
        <Box mb={2}>
          <Typography variant="subtitle1" style={{ marginBottom: '1rem' }}>
            Prompt
          </Typography>
          <TextareaAutosize
            readOnly
            value={prompt}
            style={{ width: '100%', padding: '0.75rem' }}
            maxRows={20}
          />
          <IconButton
            onClick={() => copyToClipboard(prompt, 'prompt')}
            style={{ position: 'absolute', right: '10px', top: '10px' }}
          >
            {copyStates.prompt ? <CheckIcon /> : <ContentCopyIcon />}
          </IconButton>
        </Box>
        {metadata?.redteamFinalPrompt && (
          <Box my={2}>
            <Typography variant="subtitle1" style={{ marginBottom: '1rem', marginTop: '1rem' }}>
              Modified User Input (Red Team)
            </Typography>
            <TextareaAutosize
              readOnly
              maxRows={20}
              value={metadata.redteamFinalPrompt}
              style={{ width: '100%', padding: '0.75rem' }}
            />
          </Box>
        )}
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" id="output-title" sx={{ display: 'flex', alignItems: 'center' }}>
            Output
            {output && (
              <IconButton
                aria-label="copy output"
                size="small"
                onClick={() => output && copyToClipboard(output, 'output')}
              >
                {copyStates.output ? (
                  <CheckIcon fontSize="small" />
                ) : (
                  <ContentCopyIcon fontSize="small" />
                )}
              </IconButton>
            )}
          </Typography>
          <Box sx={{ bgcolor: 'background.paper', p: 2, borderRadius: 1, mt: 1 }}>
            <TextareaAutosize
              aria-label="output"
              minRows={3}
              maxRows={10}
              value={output || ''}
              style={{ width: '100%', fontFamily: 'monospace' }}
              readOnly
            />
          </Box>
        </Box>
        {reasoning && (
          <Box sx={{ mt: 4 }}>
            <Typography
              variant="h6"
              id="reasoning-title"
              sx={{ display: 'flex', alignItems: 'center' }}
            >
              Reasoning
              <IconButton
                aria-label="copy reasoning"
                size="small"
                onClick={() => {
                  const reasoningText =
                    typeof reasoning === 'string' ? reasoning : JSON.stringify(reasoning, null, 2);
                  copyToClipboard(reasoningText, 'reasoning');
                }}
              >
                {copyStates.reasoning ? (
                  <CheckIcon fontSize="small" />
                ) : (
                  <ContentCopyIcon fontSize="small" />
                )}
              </IconButton>
            </Typography>
            <Box sx={{ bgcolor: 'background.paper', p: 2, borderRadius: 1, mt: 1 }}>
              <TextareaAutosize
                aria-label="reasoning"
                minRows={3}
                maxRows={10}
                value={
                  typeof reasoning === 'string' ? reasoning : JSON.stringify(reasoning, null, 2)
                }
                style={{ width: '100%', fontFamily: 'monospace' }}
                readOnly
              />
            </Box>
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
                    const isObject = value && typeof value === 'object';
                    const stringValue = isObject ? JSON.stringify(value, null, 2) : String(value);
                    const truncatedValue = ellipsize(stringValue, 100);

                    const expanded = metadataState[key]?.expanded || false;

                    return (
                      <TableRow key={key}>
                        <TableCell>{key}</TableCell>
                        <TableCell
                          style={{ whiteSpace: 'pre-wrap', cursor: 'pointer' }}
                          onClick={() => handleMetadataClick(key)}
                        >
                          {expanded ? stringValue : truncatedValue}
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
