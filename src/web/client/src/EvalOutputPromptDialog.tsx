import { useState, useEffect } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextareaAutosize from '@mui/base/TextareaAutosize';
import IconButton from '@mui/material/IconButton';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';

interface EvalOutputPromptDialogProps {
  open: boolean;
  onClose: () => void;
  prompt: string;
  output?: string;
}

export default function EvalOutputPromptDialog({
  open,
  onClose,
  prompt,
  output,
}: EvalOutputPromptDialogProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
  }, [prompt]);

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>Prompt</DialogTitle>
      <DialogContent>
        <TextareaAutosize readOnly value={prompt} style={{ width: '100%', padding: '0.75rem' }} />
        <IconButton
          onClick={() => copyToClipboard(prompt)}
          style={{ position: 'absolute', right: '10px', top: '10px' }}
        >
          {copied ? <CheckIcon /> : <ContentCopyIcon />}
        </IconButton>
      </DialogContent>
      {output && (
        <>
          <DialogTitle>Output</DialogTitle>
          <DialogContent>
            <TextareaAutosize
              readOnly
              value={output}
              style={{ width: '100%', padding: '0.75rem' }}
            />
          </DialogContent>
        </>
      )}
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
