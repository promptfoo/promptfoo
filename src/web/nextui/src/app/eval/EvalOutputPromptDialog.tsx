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

function AssertionResults({ gradingResults }: { gradingResults?: GradingResult[] }) {
  const [expandedValues, setExpandedValues] = useState<{ [key: number]: boolean }>({});

  if (!gradingResults) {
    return null;
  }

  const toggleExpand = (index: number) => {
    setExpandedValues((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const ellipsize = (value: string, maxLength: number) => {
    if (value.length <= maxLength) {
      return value;
    }
    return value.slice(0, maxLength) + '...';
  };

  return (
    <Box mt={2}>
      <Typography variant="subtitle1">Assertions</Typography>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
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
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
