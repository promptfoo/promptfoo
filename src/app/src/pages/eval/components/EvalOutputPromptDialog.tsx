import { useState, useEffect } from 'react';
import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import TagIcon from '@mui/icons-material/Tag';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextareaAutosize from '@mui/material/TextareaAutosize';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
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

// Component for rendering a single metadata item as a pill
const MetadataPill = ({
  keyName,
  value,
  onClick,
}: {
  keyName: string;
  value: any;
  onClick?: () => void;
}) => {
  const theme = useTheme();
  const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
  const shortValue = ellipsize(stringValue, 20);
  const fullContent = `${keyName}: ${stringValue}`;

  return (
    <Tooltip title={fullContent} arrow>
      <Chip
        size="small"
        icon={<TagIcon fontSize="small" />}
        label={`${keyName}: ${shortValue}`}
        variant="outlined"
        onClick={onClick}
        sx={{
          maxWidth: '100%',
          fontSize: '0.75rem',
          borderRadius: '16px',
          '& .MuiChip-icon': {
            fontSize: '0.875rem',
            color: theme.palette.text.secondary,
          },
        }}
      />
    </Tooltip>
  );
};

// Component for rendering a metadata value with expand/collapse functionality
const MetadataValue = ({
  keyName,
  value,
  expanded,
  onClick,
}: {
  keyName: string;
  value: any;
  expanded: boolean;
  onClick: () => void;
}) => {
  const theme = useTheme();
  const stringValue = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const displayValue = expanded ? stringValue : ellipsize(stringValue, 300);

  return (
    <Box
      sx={{
        typography: 'body2',
        whiteSpace: 'pre-wrap',
        cursor: 'pointer',
        p: 1.5,
        backgroundColor:
          theme.palette.mode === 'dark' ? theme.palette.action.hover : theme.palette.grey[50],
        borderRadius: 1,
        border: '1px solid',
        borderColor: theme.palette.divider,
        '&:hover': {
          backgroundColor: theme.palette.action.hover,
        },
      }}
      onClick={onClick}
    >
      {displayValue}
    </Box>
  );
};

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
  const [expandedMetadata, setExpandedMetadata] = useState<ExpandedMetadataState>({});
  const theme = useTheme();

  useEffect(() => {
    setCopied(false);
  }, [prompt]);

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };

  const handleMetadataClick = (key: string) => {
    const now = Date.now();
    const lastClick = expandedMetadata[key]?.lastClickTime || 0;
    const isDoubleClick = now - lastClick < 300; // 300ms threshold

    setExpandedMetadata((prev) => ({
      ...prev,
      [key]: {
        expanded: isDoubleClick ? false : true,
        lastClickTime: now,
      },
    }));
  };

  // Filter out special metadata that's displayed elsewhere
  const getFilteredMetadata = () => {
    if (!metadata) {
      return {};
    }
    const filtered = { ...metadata };

    // Remove special fields that are handled separately
    ['messages', 'redteamFinalPrompt', 'redteamHistory', 'redteamTreeHistory'].forEach((key) => {
      if (key in filtered) {
        delete filtered[key];
      }
    });

    return filtered;
  };

  let parsedMessages: Message[] = [];
  try {
    parsedMessages = JSON.parse(metadata?.messages || '[]');
  } catch {}

  const filteredMetadata = getFilteredMetadata();
  const metadataEntries = Object.entries(filteredMetadata);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>
        Details{provider && `: ${provider}`}
        <IconButton
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
          aria-label="close"
        >
          <CheckIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Box mb={3}>
          <Typography variant="subtitle1" gutterBottom>
            Prompt
          </Typography>
          <TextareaAutosize
            readOnly
            value={prompt}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '4px',
              border: `1px solid ${theme.palette.divider}`,
              backgroundColor: theme.palette.background.paper,
              fontFamily: 'monospace',
              fontSize: '14px',
            }}
            minRows={3}
            maxRows={15}
          />
          <IconButton
            onClick={() => copyToClipboard(prompt)}
            sx={{ position: 'absolute', right: '24px', top: '64px' }}
          >
            {copied ? <CheckIcon /> : <ContentCopyIcon />}
          </IconButton>
        </Box>

        {metadata?.redteamFinalPrompt && (
          <Box mb={3}>
            <Typography variant="subtitle1" gutterBottom>
              Modified User Input (Red Team)
            </Typography>
            <TextareaAutosize
              readOnly
              value={metadata.redteamFinalPrompt}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '4px',
                border: `1px solid ${theme.palette.divider}`,
                backgroundColor: theme.palette.background.paper,
                fontFamily: 'monospace',
                fontSize: '14px',
              }}
              minRows={3}
              maxRows={15}
            />
          </Box>
        )}

        {output && (
          <Box mb={3}>
            <Typography variant="subtitle1" gutterBottom>
              Output
            </Typography>
            <TextareaAutosize
              readOnly
              value={output}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '4px',
                border: `1px solid ${theme.palette.divider}`,
                backgroundColor: theme.palette.background.paper,
                fontFamily: 'monospace',
                fontSize: '14px',
              }}
              minRows={3}
              maxRows={15}
            />
          </Box>
        )}

        <AssertionResults gradingResults={gradingResults} />

        {parsedMessages && parsedMessages.length > 0 && (
          <Box mb={3}>
            <ChatMessages messages={parsedMessages} />
          </Box>
        )}

        {metadataEntries.length > 0 && (
          <Box mb={3}>
            <Typography variant="subtitle1" gutterBottom>
              Metadata
            </Typography>

            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" gap={0.75} mb={2}>
                {metadataEntries.map(([key]) => (
                  <MetadataPill
                    key={key}
                    keyName={key}
                    value={filteredMetadata[key]}
                    onClick={() => handleMetadataClick(key)}
                  />
                ))}
              </Stack>

              <Grid container spacing={2}>
                {metadataEntries.map(([key, value]) => {
                  const isExpanded = expandedMetadata[key]?.expanded;

                  return (
                    <Grid item xs={12} sm={6} md={4} key={key}>
                      <Box sx={{ mb: 1 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ pl: 1 }}>
                          {key}
                        </Typography>
                        <MetadataValue
                          keyName={key}
                          value={value}
                          expanded={!!isExpanded}
                          onClick={() => handleMetadataClick(key)}
                        />
                      </Box>
                    </Grid>
                  );
                })}
              </Grid>
            </Paper>
          </Box>
        )}

        {(metadata?.redteamHistory || metadata?.redteamTreeHistory) && (
          <Box mb={3}>
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
                      metadata: {
                        score: entry.score,
                        isOnTopic: entry.isOnTopic,
                        graderPassed: entry.graderPassed,
                      },
                    },
                  ],
                )}
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained" color="primary">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
