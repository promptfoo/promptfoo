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
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import TextareaAutosize from '@mui/material/TextareaAutosize';
import Typography from '@mui/material/Typography';
import { quote } from 'shell-quote';
import { ellipsize } from '../../../../../utils/text';
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

function generateCurlCommand(config: any, prompt: string): string {
  const url = new URL(config.url);
  const method = config.method || 'POST';
  const headers = config.headers || {};
  let body = config.body;

  // Replace {{prompt}} in the body
  if (body) {
    if (typeof body === 'string') {
      body = body.replace(/{{prompt}}/g, prompt);
    } else if (typeof body === 'object') {
      const bodyStr = JSON.stringify(body);
      body = JSON.parse(bodyStr.replace(/"{{prompt}}"/g, JSON.stringify(prompt)));
    }
  }

  const args = ['curl', '-X', method];

  // Add headers
  Object.entries(headers).forEach(([key, value]) => {
    const processedValue = String(value).replace(/{{prompt}}/g, prompt);
    args.push('-H', `${key}: ${processedValue}`);
  });

  // Add body
  if (body !== undefined && body !== null) {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    args.push('-d', bodyStr);
  }

  args.push(url.toString());
  return quote(args);
}

function generateRawHttpRequest(config: any, prompt: string): string {
  const url = new URL(config.url);
  const method = config.method || 'POST';
  const headers = config.headers || {};
  let body = config.body;

  // Replace {{prompt}} in the body
  if (body) {
    if (typeof body === 'string') {
      body = body.replace(/{{prompt}}/g, prompt);
    } else if (typeof body === 'object') {
      const bodyStr = JSON.stringify(body);
      body = JSON.parse(bodyStr.replace(/"{{prompt}}"/g, JSON.stringify(prompt)));
    }
  }

  // Build the raw HTTP request
  let request = `${method} ${url.pathname}${url.search} HTTP/1.1\n`;
  request += `Host: ${url.host}\n`;

  // Add headers
  Object.entries(headers).forEach(([key, value]) => {
    const processedValue = String(value).replace(/{{prompt}}/g, prompt);
    request += `${key}: ${processedValue}\n`;
  });

  // Add body
  if (body !== undefined && body !== null) {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
    request += `\n${bodyStr}`;
  }

  return request;
}

interface EvalOutputPromptDialogProps {
  open: boolean;
  onClose: () => void;
  prompt: string;
  provider?: string;
  output?: string;
  gradingResults?: GradingResult[];
  metadata?: Record<string, any>;
  target?: any;
  isRedteamHttp?: boolean;
}

export default function EvalOutputPromptDialog({
  open,
  onClose,
  prompt,
  provider,
  output,
  gradingResults,
  metadata,
  target,
  isRedteamHttp,
}: EvalOutputPromptDialogProps) {
  const [copied, setCopied] = useState(false);
  const [expandedMetadata, setExpandedMetadata] = useState<ExpandedMetadataState>({});
  const [curlCopied, setCurlCopied] = useState(false);
  const [rawRequestCopied, setRawRequestCopied] = useState(false);
  const [requestTab, setRequestTab] = useState(0);

  useEffect(() => {
    setCopied(false);
    setCurlCopied(false);
    setRawRequestCopied(false);
  }, [prompt]);

  const copyToClipboard = async (text: string, setCopyState: (copied: boolean) => void) => {
    await navigator.clipboard.writeText(text);
    setCopyState(true);
    setTimeout(() => setCopyState(false), 2000);
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
            onClick={() => copyToClipboard(prompt, setCopied)}
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
                          style={{ whiteSpace: 'pre-wrap', cursor: 'pointer' }}
                          onClick={() => handleMetadataClick(key)}
                        >
                          {expandedMetadata[key]?.expanded ? stringValue : truncatedValue}
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
        {isRedteamHttp && target && (
          <Box my={2}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="subtitle1">HTTP Request</Typography>
            </Box>
            <Tabs
              value={requestTab}
              onChange={(_, newValue) => setRequestTab(newValue)}
              sx={{ mb: 2 }}
            >
              <Tab label="Raw" />
              <Tab label="cURL" />
            </Tabs>
            {requestTab === 0 && (
              <Box position="relative">
                <IconButton
                  onClick={() =>
                    copyToClipboard(
                      generateRawHttpRequest(target.config, prompt),
                      setRawRequestCopied,
                    )
                  }
                  sx={{ position: 'absolute', right: 1, top: 1 }}
                >
                  {rawRequestCopied ? <CheckIcon /> : <ContentCopyIcon />}
                </IconButton>
                <TextareaAutosize
                  readOnly
                  value={generateRawHttpRequest(target.config, prompt)}
                  style={{ width: '100%', padding: '0.75rem', fontFamily: 'monospace' }}
                  maxRows={20}
                />
              </Box>
            )}
            {requestTab === 1 && (
              <Box position="relative">
                <IconButton
                  onClick={() =>
                    copyToClipboard(generateCurlCommand(target.config, prompt), setCurlCopied)
                  }
                  sx={{ position: 'absolute', right: 1, top: 1 }}
                >
                  {curlCopied ? <CheckIcon /> : <ContentCopyIcon />}
                </IconButton>
                <TextareaAutosize
                  readOnly
                  value={generateCurlCommand(target.config, prompt)}
                  style={{ width: '100%', padding: '0.75rem', fontFamily: 'monospace' }}
                  maxRows={20}
                />
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
