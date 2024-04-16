import * as React from 'react';

import yaml from 'js-yaml';
import DownloadIcon from '@mui/icons-material/Download';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';

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
      prompts: table.head.prompts.map((prompt) => prompt.display),
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

  const handleOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

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
              sx={{ justifyContent: 'flex-start' }}
            >
              Download YAML Config
            </Button>
            <Button
              onClick={downloadTable}
              startIcon={<DownloadIcon />}
              fullWidth
              sx={{ justifyContent: 'flex-start' }}
            >
              Download Table JSON
            </Button>
            <Button
              onClick={downloadDpoJson}
              startIcon={<DownloadIcon />}
              fullWidth
              sx={{ justifyContent: 'flex-start' }}
            >
              Download DPO JSON
            </Button>
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default DownloadMenu;
