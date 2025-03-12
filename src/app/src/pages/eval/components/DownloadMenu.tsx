import * as React from 'react';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import useTheme from '@mui/material/styles/useTheme';
import { ResultFailureReason } from '@promptfoo/types';
import { removeEmpty } from '@promptfoo/util/objectUtils';
import { stringify as csvStringify } from 'csv-stringify/browser/esm/sync';
import yaml from 'js-yaml';
import { useToast } from '../../../hooks/useToast';
import { useStore as useResultsViewStore } from './store';

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
      .filter((row) => row.outputs.some((output) => !output.pass))
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
      chosen: row.outputs.filter((output) => output.pass).map((output) => output.text),
      rejected: row.outputs.filter((output) => !output.pass).map((output) => output.text),
      vars: row.test.vars,
      providers: table.head.prompts.map((prompt) => prompt.provider),
      prompts: table.head.prompts.map((prompt) => prompt.label || prompt.display || prompt.raw),
    }));
    const blob = new Blob([JSON.stringify(formattedData, null, 2)], { type: 'application/json' });
    openDownloadDialog(blob, `${evalId}-dpo.json`);
    handleClose();
  };

  const downloadTable = () => {
    if (!table) {
      showToast('No table data', 'error');
      return;
    }
    const blob = new Blob([JSON.stringify(table, null, 2)], { type: 'application/json' });
    openDownloadDialog(blob, `${evalId}-table.json`);
    handleClose();
  };

  const downloadCsv = () => {
    if (!table) {
      showToast('No table data', 'error');
      return;
    }

    const csvRows = [];

    const headers = [
      ...table.head.vars,
      ...table.head.prompts.map((prompt) => `[${prompt.provider}] ${prompt.label}`),
    ];
    csvRows.push(headers);

    table.body.forEach((row) => {
      const rowValues = [
        ...row.vars,
        ...row.outputs.map(
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
    openDownloadDialog(blob, `${evalId}-table.csv`);
    handleClose();
  };

  const downloadHumanEvalTestCases = () => {
    if (!table) {
      showToast('No table data', 'error');
      return;
    }

    type TableRow = (typeof table.body)[number];

    const humanEvalCases = table.body
      .filter((row): row is TableRow => row.outputs.some((output) => output.pass !== null))
      .map((row) => ({
        vars: {
          ...row.test.vars,
          output: row.outputs[0].text.includes('---')
            ? row.outputs[0].text.split('---\n')[1]
            : row.outputs[0].text,
          redteamFinalPrompt: row.outputs[0].metadata?.redteamFinalPrompt,
          ...(row.outputs[0].gradingResult?.comment
            ? { comment: row.outputs[0].gradingResult.comment }
            : {}),
        },
        assert: [
          {
            type: 'javascript',
            value: `${row.outputs[0].pass ? '' : '!'}JSON.parse(output).pass`,
          },
        ],
        metadata: row.test.metadata,
      }));

    const yamlContent = yaml.dump(humanEvalCases);
    const blob = new Blob([yamlContent], { type: 'application/x-yaml' });
    openDownloadDialog(blob, `${evalId}-human-eval-cases.yaml`);
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
    openDownloadDialog(blob, `${evalId}-burp-payloads.burp`);
    handleClose();
  };

  const handleOpen = () => {
    setOpen(true);
  };

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        handleClose();
      } else if (open && !event.altKey && !event.ctrlKey && !event.metaKey) {
        switch (event.key) {
          case '1':
            downloadConfig();
            break;
          case '2':
            downloadFailedTestsConfig();
            break;
          case '3':
            downloadCsv();
            break;
          case '4':
            downloadTable();
            break;
          case '5':
            downloadBurpPayloads();
            break;
          case '6':
            downloadDpoJson();
            break;
          case '7':
            downloadHumanEvalTestCases();
            break;
        }
      }
    },
    [open],
  );

  React.useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (open) {
        handleKeyDown(event as unknown as React.KeyboardEvent<HTMLDivElement>);
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [handleKeyDown, open]);

  // Generate the command text based on filename
  const getCommandText = (fileName: string) => {
    return `promptfoo eval -c ${fileName}`;
  };

  // Create a component for the command with copy button
  const CommandBlock = ({ fileName, helpText }: { fileName: string; helpText?: string }) => {
    const commandText = getCommandText(fileName);
    const isDownloaded = downloadedFiles.has(fileName);

    return (
      <Box sx={{ mt: 1.5, mb: 2.5 }}>
        {helpText && (
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.75 }}>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                fontStyle: 'italic',
                flexGrow: 1,
              }}
            >
              {helpText}
            </Typography>
            {isDownloaded && (
              <Box sx={{ display: 'flex', alignItems: 'center', ml: 1 }}>
                <CheckCircleIcon fontSize="small" color="success" sx={{ mr: 0.5 }} />
                <Typography variant="body2" color="success.main">
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
            justifyContent: 'space-between',
            backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
            border: '1px solid',
            borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)',
            borderRadius: 1,
            p: '10px 16px',
            color: theme.palette.text.primary,
            fontFamily: 'monospace',
            fontSize: '0.9rem',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <Box component="code" sx={{ flexGrow: 1, mr: 1 }}>
            {commandText}
          </Box>
          <IconButton
            onClick={() => copyToClipboard(commandText)}
            size="small"
            sx={{
              color: theme.palette.primary.main,
              backgroundColor: isDarkMode ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.5)',
              '&:hover': {
                backgroundColor: isDarkMode ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.8)',
              },
              border: '1px solid',
              borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)',
            }}
            aria-label="Copy command"
          >
            <ContentCopyIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>
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
      <Dialog onClose={handleClose} open={open} onKeyDown={handleKeyDown} maxWidth="md">
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Download Options
            <Button onClick={handleClose} color="inherit" size="small">
              Close
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Stack direction="column" spacing={2} sx={{ width: '100%', mb: 2 }}>
            {/* Config section */}
            <Typography variant="subtitle1" sx={{ mt: 1 }}>
              Promptfoo Configs
            </Typography>

            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Download the complete configuration file for this eval.
              </Typography>

              <Button
                onClick={downloadConfig}
                startIcon={<DownloadIcon />}
                variant="contained"
                color="primary"
                fullWidth
              >
                Download YAML Config
              </Button>

              <CommandBlock
                fileName={evalId ? `${evalId}-config.yaml` : 'promptfooconfig.yaml'}
                helpText="After downloading, run this command to execute the eval again:"
              />
            </Box>

            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Download a configuration file containing only the failed tests from this eval. This
                helps you focus on fixing just the tests that need attention.
              </Typography>

              <Button
                onClick={downloadFailedTestsConfig}
                startIcon={<DownloadIcon />}
                variant="outlined"
                color="secondary"
                fullWidth
                disabled={
                  !table || table.body.every((row) => row.outputs.every((output) => output.pass))
                }
              >
                Download Failed Tests Config
              </Button>

              <CommandBlock
                fileName={evalId ? `${evalId}-failed-tests.yaml` : 'failed-tests.yaml'}
                helpText="After downloading, run this command to re-run just the failed tests:"
              />
            </Box>

            <Divider />
            <Typography variant="subtitle1">Table Data</Typography>

            {/* Standard table data buttons */}
            <Button onClick={downloadCsv} startIcon={<DownloadIcon />} variant="outlined" fullWidth>
              Download Table CSV
            </Button>

            <Button
              onClick={downloadTable}
              startIcon={<DownloadIcon />}
              variant="outlined"
              fullWidth
            >
              Download Table JSON
            </Button>

            <Divider />
            <Typography variant="subtitle1">Advanced Options</Typography>

            <Button
              onClick={downloadBurpPayloads}
              startIcon={<DownloadIcon />}
              variant="outlined"
              color="secondary"
              fullWidth
            >
              Download Burp Suite Payloads
            </Button>

            <Button
              onClick={downloadDpoJson}
              startIcon={<DownloadIcon />}
              variant="outlined"
              color="secondary"
              fullWidth
            >
              Download DPO JSON
            </Button>

            <Button
              onClick={downloadHumanEvalTestCases}
              startIcon={<DownloadIcon />}
              variant="outlined"
              color="secondary"
              fullWidth
            >
              Download Human Eval Test YAML
            </Button>
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default DownloadMenu;
