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
import { stringify as csvStringify } from 'csv-stringify/browser/esm/sync';
import yaml from 'js-yaml';
import { useStore as useResultsViewStore } from './store';

function DownloadMenu() {
  const { table, config, evalId } = useResultsViewStore();
  const [open, setOpen] = React.useState(false);

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

  const downloadConfig = () => {
    const configData = yaml.dump(config);
    const mimeType = 'text/yaml;charset=utf-8';
    const blob = new Blob([configData], { type: mimeType });
    openDownloadDialog(blob, 'promptfooconfig.yaml');
    handleClose();
  };

  const downloadDpoJson = () => {
    if (!table) {
      alert('No table data');
      return;
    }
    const formattedData = table.body.map((row, index) => ({
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
      alert('No table data');
      return;
    }
    const blob = new Blob([JSON.stringify(table, null, 2)], { type: 'application/json' });
    openDownloadDialog(blob, `${evalId}-table.json`);
    handleClose();
  };

  const downloadCsv = () => {
    if (!table) {
      alert('No table data');
      return;
    }

    const csvRows = [];

    // Create headers
    const headers = [
      ...table.head.vars,
      ...table.head.prompts.map((prompt) => `[${prompt.provider}] ${prompt.label}`),
    ];
    csvRows.push(headers);

    // Create rows
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
      alert('No table data');
      return;
    }

    const humanEvalCases = table.body
      .filter((row): row is (typeof table.body)[number] =>
        row.outputs.some((output) => output.pass !== null),
      )
      .map((row) => ({
        vars: {
          ...row.test.vars,
          output: row.outputs[0].text.includes('---')
            ? row.outputs[0].text.split('---\n')[1]
            : row.outputs[0].text,
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
      alert('No table data');
      return;
    }

    if (!config?.redteam) {
      alert('No redteam config');
      return;
    }

    // Extract all unique test inputs and prepare them for Burp
    const varName = config.redteam.injectVar || 'prompt';
    const payloads = table.body
      .map((row) => {
        const vars = row.test.vars as Record<string, unknown>;
        return String(vars?.[varName] || '');
      })
      .filter(Boolean)
      .map((input) => {
        // JSON escape and URL encode
        const jsonEscaped = JSON.stringify(input).slice(1, -1); // Remove surrounding quotes
        return encodeURIComponent(jsonEscaped);
      });

    // Remove duplicates
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
