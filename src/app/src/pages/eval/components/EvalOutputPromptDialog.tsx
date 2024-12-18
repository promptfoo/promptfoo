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
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextareaAutosize from '@mui/material/TextareaAutosize';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import type { GradingResult } from './types';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

function ellipsize(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength) + '...';
}

function ChatMessage({ message }: { message: Message }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isUser = message.role === 'user';

  const backgroundColor = isUser
    ? 'linear-gradient(to bottom right, #FF8B96, #FF4B40)'
    : isDark
      ? 'linear-gradient(to bottom right, #3A3A3C, #2C2C2E)'
      : 'linear-gradient(to bottom right, #E9E9EB, #D1D1D6)';

  const textColor = isUser || isDark ? '#FFFFFF' : '#000000';
  const alignSelf = isUser ? 'flex-end' : 'flex-start';
  const borderRadius = isUser ? '20px 20px 5px 20px' : '20px 20px 20px 5px';

  return (
    <Box sx={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', mb: 1 }}>
      <Paper
        elevation={1}
        sx={{
          p: 1.5,
          maxWidth: '70%',
          background: backgroundColor,
          borderRadius,
          alignSelf,
          boxShadow: isDark ? '0 2px 8px rgba(0, 0, 0, 0.3)' : '0 2px 8px rgba(0, 0, 0, 0.1)',
        }}
      >
        <Typography
          variant="body1"
          sx={{
            whiteSpace: 'pre-wrap',
            color: textColor,
            textShadow: isUser ? '0 1px 2px rgba(0, 0, 0, 0.2)' : 'none',
            fontWeight: isUser ? 500 : 400,
          }}
        >
          {message.content}
        </Typography>
      </Paper>
    </Box>
  );
}

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
  const [expandedMetadata, setExpandedMetadata] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    setCopied(false);
  }, [prompt]);

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };

  const toggleMetadataExpand = (key: string) => {
    setExpandedMetadata((prev) => ({ ...prev, [key]: !prev[key] }));
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
            onClick={() => copyToClipboard(prompt)}
            style={{ position: 'absolute', right: '10px', top: '10px' }}
          >
            {copied ? <CheckIcon /> : <ContentCopyIcon />}
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
        {output && (
          <Box my={2}>
            <Typography variant="subtitle1" style={{ marginBottom: '1rem', marginTop: '1rem' }}>
              Output
            </Typography>
            <TextareaAutosize
              readOnly
              maxRows={20}
              value={output}
              style={{ width: '100%', padding: '0.75rem' }}
            />
          </Box>
        )}
        <AssertionResults gradingResults={gradingResults} />
        {parsedMessages && parsedMessages.length > 0 && (
          <>
            <Typography variant="subtitle1" style={{ marginBottom: '1rem', marginTop: '1rem' }}>
              Messages
            </Typography>
            <Box
              mb={2}
              sx={{
                backgroundColor: (theme) =>
                  theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.2)' : '#F8F9FA',
                p: 2,
                borderRadius: 2,
              }}
            >
              {parsedMessages.map((message: Message, index: number) => (
                <ChatMessage key={index} message={message} />
              ))}
            </Box>
          </>
        )}
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
                    const isExpanded = expandedMetadata[key] || false;

                    return (
                      <TableRow key={key}>
                        <TableCell>{key}</TableCell>
                        <TableCell
                          style={{ whiteSpace: 'pre-wrap', cursor: 'pointer' }}
                          onClick={() => toggleMetadataExpand(key)}
                        >
                          {isExpanded ? stringValue : truncatedValue}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
