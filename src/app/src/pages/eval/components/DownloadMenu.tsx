import React from 'react';

import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { type EvaluateTableOutput, ResultFailureReason } from '@promptfoo/types';
import { removeEmpty } from '@promptfoo/util/objectUtils';
import { stringify as csvStringify } from 'csv-stringify/browser/esm/sync';
import yaml from 'js-yaml';
import { useToast } from '../../../hooks/useToast';
import { useTableStore as useResultsViewStore } from './store';

function DownloadMenu() {
  const { table, config, evalId } = useResultsViewStore();
  const [open, setOpen] = React.useState(false);
  const [downloadedFiles, setDownloadedFiles] = React.useState<Set<string>>(new Set());
  const { showToast } = useToast();
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  const openDownloadDialog = (blob: Blob, downloadName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // Mark this file as downloaded
    setDownloadedFiles((prev) => new Set([...prev, downloadName]));
  };

  const handleClose = () => {
    setOpen(false);
    // Reset download states when dialog is closed
    setDownloadedFiles(new Set());
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        showToast('Command copied to clipboard', 'success');
      })
      .catch((err) => {
        console.error('Failed to copy text: ', err);
        showToast('Failed to copy command', 'error');
      });
  };

  /**
   * Helper function to download YAML configuration
   * @param configToDownload Configuration object to download
   * @param fileName Name of the downloaded file
   * @param successMessage Message to show in the success toast
   * @param options Additional options (skipInvalid for yaml.dump)
   */
  const downloadYamlConfig = (
    configToDownload: any,
    fileName: string,
    successMessage: string,
    options: { skipInvalid?: boolean } = {},
  ) => {
    const schemaLine = '# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json\n';

    // Clean top-level empty properties
    const cleanConfig = removeEmpty(configToDownload);

    // Convert to YAML
    const configData = yaml.dump(cleanConfig, options);

    // Create the blob and download
    const mimeType = 'text/yaml;charset=utf-8';
    const blob = new Blob([schemaLine + configData], { type: mimeType });
    openDownloadDialog(blob, fileName);
    showToast(successMessage, 'success');
    // No longer closing the dialog after download
  };

  const downloadConfig = () => {
    const fileName = evalId ? `${evalId}-config.yaml` : 'promptfooconfig.yaml';
    downloadYamlConfig(config, fileName, 'Configuration downloaded successfully');
  };

  const downloadFailedTestsConfig = () => {
    if (!config || !table) {
      showToast('No configuration or results available', 'error');
      return;
    }

    // Find the failed tests
    const failedTests = table.body
      .filter((row) => row.outputs.some((output) => !output?.pass))
      .map((row) => row.test);

    if (failedTests.length === 0) {
      showToast('No failed tests found', 'info');
      return;
    }

    // Create a modified copy of the config with only failed tests
    const configCopy = { ...config, tests: failedTests };

    // Create the file name
    const fileName = evalId ? `${evalId}-failed-tests.yaml` : 'failed-tests.yaml';

    downloadYamlConfig(
      configCopy,
      fileName,
      `Downloaded config with ${failedTests.length} failed tests`,
      { skipInvalid: true },
    );
  };

  const downloadDpoJson = () => {
    if (!table) {
      showToast('No table data', 'error');
      return;
    }
    const formattedData = table.body.map((row) => ({
      chosen: row.outputs.filter((output) => output?.pass).map((output) => output!.text),
      rejected: row.outputs.filter((output) => output && !output.pass).map((output) => output.text),
      vars: row.test.vars,
      providers: table.head.prompts.map((prompt) => prompt.provider),
      prompts: table.head.prompts.map((prompt) => prompt.label || prompt.display || prompt.raw),
    }));
    const blob = new Blob([JSON.stringify(formattedData, null, 2)], { type: 'application/json' });
    openDownloadDialog(blob, `${evalId ?? 'eval'}-dpo.json`);
    handleClose();
  };

  const downloadTable = () => {
    if (!table) {
      showToast('No table data', 'error');
      return;
    }
    const blob = new Blob([JSON.stringify(table, null, 2)], { type: 'application/json' });
    openDownloadDialog(blob, `${evalId ?? 'eval'}-table.json`);
    handleClose();
  };

  const downloadCsv = () => {
    if (!table) {
      showToast('No table data', 'error');
      return;
    }

    const csvRows = [];

    // Check if any rows have descriptions
    const hasDescriptions = table.body.some((row) => row.test.description);

    const headers = [
      ...(hasDescriptions ? ['Description'] : []),
      ...table.head.vars,
      ...table.head.prompts.map((prompt) => `[${prompt.provider}] ${prompt.label}`),
    ];
    csvRows.push(headers);

    table.body.forEach((row) => {
      const rowValues = [
        ...(hasDescriptions ? [row.test.description || ''] : []),
        ...row.vars,
        ...row.outputs
          .filter((output): output is EvaluateTableOutput => output != null)
          .map(
            ({ pass, text, failureReason: failureType }) =>
              (pass
                ? '[PASS] '
                : failureType === ResultFailureReason.ASSERT
                  ? '[FAIL] '
                  : '[ERROR] ') + text,
          ),
      ];
      csvRows.push(rowValues);
    });

    const output = csvStringify(csvRows);
    const blob = new Blob([output], { type: 'text/csv;charset=utf-8;' });
    openDownloadDialog(blob, `${evalId ?? 'eval'}-table.csv`);
    handleClose();
  };

  const downloadHumanEvalTestCases = () => {
    if (!table) {
      showToast('No table data', 'error');
      return;
    }

    const humanEvalCases = table.body
      .filter((row) => row.outputs.some((output) => output != null))
      .map((row) => ({
        vars: {
          ...row.test.vars,
          output: row.outputs[0]?.text.includes('---')
            ? row.outputs[0]!.text.split('---\n')[1]
            : (row.outputs[0]?.text ?? ''),
          redteamFinalPrompt: row.outputs[0]?.metadata?.redteamFinalPrompt,
          ...(row.outputs[0]?.gradingResult?.comment
            ? { comment: row.outputs[0]!.gradingResult!.comment }
            : {}),
        },
        assert: [
          {
            type: 'javascript',
            value: `${row.outputs[0]?.pass ? '' : '!'}JSON.parse(output).pass`,
          },
        ],
        metadata: row.test.metadata,
      }));

    const yamlContent = yaml.dump(humanEvalCases);
    const blob = new Blob([yamlContent], { type: 'application/x-yaml' });
    openDownloadDialog(blob, `${evalId ?? 'eval'}-human-eval-cases.yaml`);
    handleClose();
  };

  const downloadBurpPayloads = () => {
    if (!table) {
      showToast('No table data', 'error');
      return;
    }

    if (!config?.redteam) {
      showToast('No redteam config', 'error');
      return;
    }

    const varName = config.redteam.injectVar || 'prompt';
    const payloads = table.body
      .map((row) => {
        const vars = row.test.vars as Record<string, unknown>;
        return String(vars?.[varName] || '');
      })
      .filter(Boolean)
      .map((input) => {
        const jsonEscaped = JSON.stringify(input).slice(1, -1); // Remove surrounding quotes
        return encodeURIComponent(jsonEscaped);
      });

    const uniquePayloads = [...new Set(payloads)];

    const content = uniquePayloads.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    openDownloadDialog(blob, `${evalId ?? 'eval'}-burp-payloads.burp`);
    handleClose();
  };

  const handleOpen = () => {
    setOpen(true);
  };

  // Generate the command text based on filename
  const getCommandText = (fileName: string) => {
    return `promptfoo eval -c ${fileName}`;
  };

  // Create a component for the command with copy button
  const CommandBlock = ({ fileName, helpText }: { fileName: string; helpText?: string }) => {
    const commandText = getCommandText(fileName);
    const isDownloaded = downloadedFiles.has(fileName);

    return (
      <Paper
        elevation={0}
        sx={{
          mt: 2,
          p: 2,
          backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
          border: '1px solid',
          borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
          borderRadius: 2,
        }}
      >
        {helpText && (
          <Box
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}
          >
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
              {helpText}
            </Typography>
            {isDownloaded && (
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <CheckCircleIcon fontSize="small" color="success" sx={{ mr: 0.5 }} />
                <Typography variant="body2" color="success.main" sx={{ fontWeight: 500 }}>
                  Downloaded
                </Typography>
              </Box>
            )}
          </Box>
        )}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: isDarkMode ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.8)',
            border: '1px solid',
            borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
            borderRadius: 1.5,
            p: 1.5,
          }}
        >
          <Box
            component="code"
            sx={{
              flexGrow: 1,
              fontFamily: '"SF Mono", "Monaco", "Inconsolata", "Roboto Mono", monospace',
              fontSize: '0.875rem',
              color: theme.palette.text.primary,
              fontWeight: 500,
            }}
          >
            {commandText}
          </Box>
          <IconButton
            onClick={() => copyToClipboard(commandText)}
            size="small"
            sx={{
              ml: 1,
              color: theme.palette.primary.main,
              backgroundColor: 'transparent',
              '&:hover': {
                backgroundColor: theme.palette.primary.main + '15',
              },
            }}
            aria-label="Copy command"
          >
            <ContentCopyIcon fontSize="small" />
          </IconButton>
        </Box>
      </Paper>
    );
  };

  return (
    <>
      <MenuItem onClick={handleOpen}>
        <ListItemIcon>
          <DownloadIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Download</ListItemText>
      </MenuItem>
      <Dialog onClose={handleClose} open={open} maxWidth="lg">
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h5" component="h2" sx={{ fontWeight: 600 }}>
              Download Options
            </Typography>
            <Button onClick={handleClose} variant="outlined" size="small">
              Close
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <Stack spacing={3}>
            {/* Configuration Files Section */}
            <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                  Configuration Files
                </Typography>

                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <Box sx={{ height: '100%' }}>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Complete configuration file for this evaluation
                      </Typography>
                      <Button
                        onClick={downloadConfig}
                        startIcon={<DownloadIcon />}
                        variant="contained"
                        fullWidth
                        sx={{ mb: 1 }}
                      >
                        Download YAML Config
                      </Button>
                      <CommandBlock
                        fileName={evalId ? `${evalId}-config.yaml` : 'promptfooconfig.yaml'}
                        helpText="Run this command to execute the eval again:"
                      />
                    </Box>
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <Box sx={{ height: '100%' }}>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Configuration with only failed tests for focused debugging
                      </Typography>
                      <Button
                        onClick={downloadFailedTestsConfig}
                        startIcon={<DownloadIcon />}
                        variant="outlined"
                        fullWidth
                        sx={{ mb: 1 }}
                        disabled={
                          !table ||
                          !table.body ||
                          table.body.every((row) => row.outputs.every((output) => output?.pass))
                        }
                      >
                        Download Failed Tests
                      </Button>
                      <CommandBlock
                        fileName={evalId ? `${evalId}-failed-tests.yaml` : 'failed-tests.yaml'}
                        helpText="Run this command to re-run just the failed tests:"
                      />
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>

            {/* Table Data Section */}
            <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
                  Table Data Exports
                </Typography>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  Export evaluation results in standard formats for further analysis or reporting.
                </Typography>

                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <Button
                      onClick={downloadCsv}
                      startIcon={<DownloadIcon />}
                      variant="outlined"
                      fullWidth
                      sx={{ height: 48 }}
                    >
                      CSV Export
                    </Button>
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <Button
                      onClick={downloadTable}
                      startIcon={<DownloadIcon />}
                      variant="outlined"
                      fullWidth
                      sx={{ height: 48 }}
                    >
                      JSON Export
                    </Button>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>

            {/* Advanced Options Section */}
            <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
                  Advanced Exports
                </Typography>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  Specialized formats for security testing, machine learning training, and human
                  evaluation workflows.
                </Typography>

                <Grid container spacing={2}>
                  <Grid item xs={12} md={4}>
                    <Button
                      onClick={downloadBurpPayloads}
                      startIcon={<DownloadIcon />}
                      variant="outlined"
                      fullWidth
                      sx={{ height: 48 }}
                    >
                      Burp Payloads
                    </Button>
                  </Grid>

                  <Grid item xs={12} md={4}>
                    <Button
                      onClick={downloadDpoJson}
                      startIcon={<DownloadIcon />}
                      variant="outlined"
                      fullWidth
                      sx={{ height: 48 }}
                    >
                      DPO JSON
                    </Button>
                  </Grid>

                  <Grid item xs={12} md={4}>
                    <Button
                      onClick={downloadHumanEvalTestCases}
                      startIcon={<DownloadIcon />}
                      variant="outlined"
                      fullWidth
                      sx={{ height: 48 }}
                    >
                      Human Eval YAML
                    </Button>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default DownloadMenu;
