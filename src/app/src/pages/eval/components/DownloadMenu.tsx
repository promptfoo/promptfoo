import * as React from 'react';
import DownloadIcon from '@mui/icons-material/Download';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { ResultFailureReason } from '@promptfoo/types';
import { removeEmpty } from '@promptfoo/util/objectUtils';
import { stringify as csvStringify } from 'csv-stringify/browser/esm/sync';
import yaml from 'js-yaml';
import { useToast } from '../../../hooks/useToast';
import { useStore as useResultsViewStore } from './store';

function DownloadMenu() {
  const { table, config, evalId } = useResultsViewStore();
  const [open, setOpen] = React.useState(false);
  const { showToast } = useToast();

  const openDownloadDialog = (blob: Blob, downloadName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleClose = () => {
    setOpen(false);
  };

  /**
   * Helper function to download YAML configuration
   * @param configToDownload Configuration object to download
   * @param fileName Name of the downloaded file
   * @param successMessage Message to show in the success toast
   * @param options Additional options (skipInvalid for yaml.dump)
   */
  const downloadYamlConfig = (
    configToDownload: Record<string, unknown>,
    fileName: string,
    successMessage: string,
    options: { skipInvalid?: boolean } = {},
  ): void => {
    const schemaLine = '# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json\n';

    const cleanConfig = removeEmpty(configToDownload);

    const configData = yaml.dump(cleanConfig, options);

    const mimeType = 'text/yaml;charset=utf-8';
    const blob = new Blob([schemaLine + configData], { type: mimeType });
    openDownloadDialog(blob, fileName);
    showToast(successMessage, 'success');
    handleClose();
  };

  const downloadConfig = () => {
    downloadYamlConfig(
      config as Record<string, unknown>,
      'promptfooconfig.yaml',
      'Configuration downloaded successfully',
    );
  };

  const downloadFailedTestsConfig = () => {
    if (!config || !table) {
      showToast('No configuration or results available', 'error');
      return;
    }

    const failedTests = table.body
      .filter((row) => row.outputs.some((output) => !output.pass))
      .map((row) => row.test);

    if (failedTests.length === 0) {
      showToast('No failed tests found', 'info');
      return;
    }

    const configCopy = { ...config, tests: failedTests };

    const fileName = evalId ? `${evalId}-failed-tests.yaml` : 'promptfoo-failed-tests.yaml';

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
            downloadCsv();
            break;
          case '3':
            downloadTable();
            break;
          case '4':
            downloadDpoJson();
            break;
          case '5':
            downloadHumanEvalTestCases();
            break;
          case '6':
            downloadBurpPayloads();
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

  return (
    <>
      <MenuItem onClick={handleOpen}>
        <ListItemIcon>
          <DownloadIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Download</ListItemText>
      </MenuItem>
      <Dialog onClose={handleClose} open={open} onKeyDown={handleKeyDown}>
        <DialogTitle>Download Options</DialogTitle>
        <DialogContent>
          <Stack direction="column" spacing={2} sx={{ width: '100%' }}>
            <Tooltip title="Download the YAML configuration file">
              <Button
                onClick={downloadConfig}
                startIcon={<DownloadIcon />}
                variant="contained"
                color="primary"
                fullWidth
              >
                Download YAML Config
              </Button>
            </Tooltip>

            <Tooltip title="Download failed tests configuration">
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
            </Tooltip>

            <Divider />
            <Typography variant="subtitle1">Table Data</Typography>

            <Tooltip title="Download table data in CSV format">
              <Button
                onClick={downloadCsv}
                startIcon={<DownloadIcon />}
                variant="outlined"
                fullWidth
              >
                Download Table CSV
              </Button>
            </Tooltip>

            <Tooltip title="Download table data in JSON format">
              <Button
                onClick={downloadTable}
                startIcon={<DownloadIcon />}
                variant="outlined"
                fullWidth
              >
                Download Table JSON
              </Button>
            </Tooltip>

            <Divider />
            <Typography variant="subtitle1">Advanced Options</Typography>

            <Tooltip title="Download Direct Preference Optimization JSON">
              <Button
                onClick={downloadDpoJson}
                startIcon={<DownloadIcon />}
                variant="outlined"
                color="secondary"
                fullWidth
              >
                Download DPO JSON
              </Button>
            </Tooltip>

            <Tooltip title="Download Evaluation Test Cases in YAML format">
              <Button
                onClick={downloadHumanEvalTestCases}
                startIcon={<DownloadIcon />}
                variant="outlined"
                color="secondary"
                fullWidth
              >
                Download Human Eval Test YAML
              </Button>
            </Tooltip>

            {config?.redteam && (
              <Tooltip title="Download test inputs as Burp Intruder payloads (JSON-escaped and URL-encoded)">
                <Button
                  onClick={downloadBurpPayloads}
                  startIcon={<DownloadIcon />}
                  variant="outlined"
                  color="secondary"
                  fullWidth
                >
                  Download Burp Suite Payloads
                </Button>
              </Tooltip>
            )}
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default DownloadMenu;
