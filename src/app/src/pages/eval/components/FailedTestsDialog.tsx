import * as React from 'react';
import { useToast } from '@app/hooks/useToast';
import DownloadIcon from '@mui/icons-material/Download';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { EvaluateTable, UnifiedConfig } from '@promptfoo/types';
import yaml from 'js-yaml';

interface FailedTestsDialogProps {
  open: boolean;
  onClose: () => void;
  evalId: string;
  config: Partial<UnifiedConfig> | null;
  table: EvaluateTable | null;
}

export default function FailedTestsDialog({
  open,
  onClose,
  evalId,
  config,
  table,
}: FailedTestsDialogProps) {
  const { showToast } = useToast();

  const handleDownload = () => {
    if (!config || !table) {
      showToast('No configuration or results available', 'error');
      return;
    }

    // Create a copy of the config to modify
    const configCopy = { ...config };

    // Find the failed tests
    const failedTests = table.body
      .filter((row) => row.outputs.some((output) => !output.pass))
      .map((row) => row.test);

    if (failedTests.length === 0) {
      showToast('No failed tests found', 'info');
      return;
    }

    // Replace the tests array with only the failed tests
    configCopy.tests = failedTests;

    // Convert to YAML and download
    const yamlContent = yaml.dump(configCopy, { skipInvalid: true });
    const mimeType = 'text/yaml;charset=utf-8';
    const blob = new Blob(
      [`# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json\n${yamlContent}`],
      { type: mimeType },
    );

    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${evalId}-failed-tests.yaml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`Downloaded config with ${failedTests.length} failed tests`, 'success');
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md">
      <DialogTitle>Download Failed Tests</DialogTitle>
      <DialogContent>
        <DialogContentText>
          This generates a YAML configuration file containing only the failed tests from this
          evaluation.
        </DialogContentText>

        <Box sx={{ mt: 3, mb: 2 }}>
          <Typography variant="subtitle1" gutterBottom>
            After downloading, you can run the failed tests using this command:
          </Typography>
          <Paper
            elevation={0}
            sx={{
              p: 2,
              backgroundColor: (theme) => (theme.palette.mode === 'dark' ? '#1A2027' : '#f5f5f5'),
              fontFamily: 'monospace',
              borderRadius: 1,
            }}
          >
            <code>promptfoo run -c failed_tests.yaml</code>
          </Paper>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleDownload}
          startIcon={<DownloadIcon />}
          variant="contained"
          color="primary"
        >
          Download Failed Tests
        </Button>
      </DialogActions>
    </Dialog>
  );
}
