import {
  CheckCircle as CheckCircleIcon,
  ContentCopy as ContentCopyIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  IconButton,
  Link,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useState } from 'react';

interface InstallationGuideProps {
  onRetryCheck: () => void;
  isChecking: boolean;
  error?: string | null;
}

/**
 * Installation guidance component shown when modelaudit CLI is not installed.
 * Provides step-by-step instructions and helpful resources.
 */
export default function InstallationGuide({
  onRetryCheck,
  isChecking,
  error,
}: InstallationGuideProps) {
  const [copied, setCopied] = useState(false);

  const installCommand = 'pip install modelaudit';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(installCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 3,
        borderColor: 'warning.main',
        backgroundColor: (theme) =>
          theme.palette.mode === 'dark'
            ? 'rgba(237, 108, 2, 0.08)'
            : 'rgba(237, 108, 2, 0.04)',
      }}
    >
      <Alert severity="warning" sx={{ mb: 3 }}>
        <AlertTitle>ModelAudit CLI Not Found</AlertTitle>
        {error || 'The modelaudit command-line tool needs to be installed to run security scans.'}
      </Alert>

      <Typography variant="h6" gutterBottom fontWeight={600}>
        Quick Installation
      </Typography>

      <Paper
        variant="outlined"
        sx={{
          p: 2,
          mb: 3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontFamily: 'monospace',
          backgroundColor: (theme) =>
            theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
        }}
      >
        <code>{installCommand}</code>
        <Tooltip title={copied ? 'Copied!' : 'Copy command'}>
          <IconButton size="small" onClick={handleCopy}>
            {copied ? <CheckCircleIcon color="success" /> : <ContentCopyIcon />}
          </IconButton>
        </Tooltip>
      </Paper>

      <Typography variant="body2" color="text.secondary" paragraph>
        Make sure you have Python 3.8+ installed. After installation, run the command in your terminal.
      </Typography>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mb={3}>
        <Button
          variant="contained"
          onClick={onRetryCheck}
          disabled={isChecking}
        >
          {isChecking ? 'Checking...' : 'Check Again'}
        </Button>
        <Button
          variant="outlined"
          href="https://www.promptfoo.dev/docs/model-audit/"
          target="_blank"
          rel="noopener"
          endIcon={<OpenInNewIcon />}
        >
          View Documentation
        </Button>
      </Stack>

      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        Troubleshooting
      </Typography>
      <Box component="ul" sx={{ mt: 1, pl: 2, '& li': { mb: 1 } }}>
        <li>
          <Typography variant="body2" color="text.secondary">
            Make sure <code>pip</code> is available in your PATH
          </Typography>
        </li>
        <li>
          <Typography variant="body2" color="text.secondary">
            Try using <code>pip3 install modelaudit</code> if <code>pip</code> doesn't work
          </Typography>
        </li>
        <li>
          <Typography variant="body2" color="text.secondary">
            If using a virtual environment, ensure it's activated
          </Typography>
        </li>
        <li>
          <Typography variant="body2" color="text.secondary">
            After installation, you may need to restart the Promptfoo server
          </Typography>
        </li>
      </Box>

      <Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
        <Typography variant="body2" color="text.secondary">
          Need help?{' '}
          <Link
            href="https://github.com/promptfoo/promptfoo/issues"
            target="_blank"
            rel="noopener"
          >
            Open an issue on GitHub
          </Link>{' '}
          or check the{' '}
          <Link
            href="https://www.promptfoo.dev/docs/model-audit/installation/"
            target="_blank"
            rel="noopener"
          >
            installation guide
          </Link>
          .
        </Typography>
      </Box>
    </Paper>
  );
}
