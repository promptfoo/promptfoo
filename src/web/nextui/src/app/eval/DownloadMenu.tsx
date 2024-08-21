import * as React from 'react';
import DownloadIcon from '@mui/icons-material/Download';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { stringify as csvStringify } from 'csv-stringify/sync';
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
        ...row.outputs.map(({ pass, text }) => (pass ? '[PASS] ' : '[FAIL] ') + text),
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
          output: row.outputs[0].text,
        },
        assert: {
          type: 'javascript',
          value: `${row.outputs[0].pass ? '' : '!'}JSON.parse(output).pass`,
        },
      }));

    const yamlContent = yaml.dump(humanEvalCases);
    const blob = new Blob([yamlContent], { type: 'application/x-yaml' });
    openDownloadDialog(blob, `${evalId}-human-eval-cases.yaml`);
    handleClose();
  };

  const handleOpen = () => {
    setOpen(true);
  };

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (open && !event.altKey && !event.ctrlKey && !event.metaKey) {
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
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <>
      <MenuItem onClick={handleOpen}>
        <ListItemIcon>
          <DownloadIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Download</ListItemText>
      </MenuItem>
      <Dialog onClose={handleClose} open={open}>
        <DialogContent>
          <Stack direction="column" spacing={2} sx={{ width: '100%' }}>
            <Button
              onClick={downloadConfig}
              startIcon={<DownloadIcon />}
              fullWidth
              sx={{ justifyContent: 'space-between' }}
            >
              <span>Download YAML Config</span>
              <Typography variant="caption">(1)</Typography>
            </Button>
            <Button
              onClick={downloadCsv}
              startIcon={<DownloadIcon />}
              fullWidth
              sx={{ justifyContent: 'space-between' }}
            >
              <span>Download Table CSV</span>
              <Typography variant="caption">(2)</Typography>
            </Button>
            <Button
              onClick={downloadTable}
              startIcon={<DownloadIcon />}
              fullWidth
              sx={{ justifyContent: 'space-between' }}
            >
              <span>Download Table JSON</span>
              <Typography variant="caption">(3)</Typography>
            </Button>
            <Button
              onClick={downloadDpoJson}
              startIcon={<DownloadIcon />}
              fullWidth
              sx={{ justifyContent: 'space-between' }}
            >
              <span>Download DPO JSON</span>
              <Typography variant="caption">(4)</Typography>
            </Button>
            <Button
              onClick={downloadHumanEvalTestCases}
              startIcon={<DownloadIcon />}
              fullWidth
              sx={{ justifyContent: 'space-between' }}
            >
              <span>Download Human Eval Test YAML</span>
              <Typography variant="caption">(5)</Typography>
            </Button>
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default DownloadMenu;
