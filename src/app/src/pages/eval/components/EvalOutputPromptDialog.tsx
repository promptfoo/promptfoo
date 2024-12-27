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
import TextareaAutosize from '@mui/material/TextareaAutosize';
import Typography from '@mui/material/Typography';
import { AssertionResults } from './AssertionResults';
import ChatMessages, { type Message } from './ChatMessages';
import { MetadataTable } from './MetadataTable';
import type { GradingResult } from './types';

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

  useEffect(() => {
    setCopied(false);
  }, [prompt]);

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };

  let parsedMessages: Message[] = [];
  try {
    parsedMessages = JSON.parse(metadata?.messages || '[]');
  } catch {}

  // Don't render anything if not open
  if (!open) {
    return null;
  }

  return (
    <Dialog open={true} onClose={onClose} fullWidth maxWidth="lg">
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
        {parsedMessages && parsedMessages.length > 0 && <ChatMessages messages={parsedMessages} />}
        {metadata && Object.keys(metadata).length > 0 && (
          <Box my={2}>
            <Typography variant="subtitle1" style={{ marginBottom: '1rem' }}>
              Metadata
            </Typography>
            <MetadataTable metadata={metadata} />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
