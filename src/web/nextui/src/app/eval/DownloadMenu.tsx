import * as React from 'react';

import yaml from 'js-yaml';
import Button from '@mui/material/Button';
import DownloadIcon from '@mui/icons-material/Download';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';

import { useStore as useResultsViewStore } from './store';

function DownloadMenu() {
  const { table, config, evalId } = useResultsViewStore();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);

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
    setAnchorEl(null);
    const configData = yaml.dump(config);
    const mimeType = 'text/yaml;charset=utf-8';
    const blob = new Blob([configData], { type: mimeType });
    openDownloadDialog(blob, 'promptfooconfig.yaml');
  };

  const downloadDpoJson = () => {
    setAnchorEl(null);
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
  };

  const downloadTable = () => {
    setAnchorEl(null);
    if (!table) {
      alert('No table data');
      return;
    }
    const blob = new Blob([JSON.stringify(table, null, 2)], { type: 'application/json' });
    openDownloadDialog(blob, `${evalId}-table.json`);
  };

  return (
    <>
      <Tooltip title="Download options">
        <Button
          color="primary"
          aria-controls="download-menu"
          aria-haspopup="true"
          onClick={(event) => {
            setAnchorEl(event.currentTarget);
          }}
          startIcon={<DownloadIcon />}
        >
          Download
        </Button>
      </Tooltip>
      <Menu
        id="download-menu"
        anchorEl={anchorEl}
        keepMounted
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        <MenuItem onClick={downloadConfig}>YAML config</MenuItem>
        <MenuItem onClick={downloadTable}>Table JSON</MenuItem>
        <MenuItem onClick={downloadDpoJson}>DPO JSON</MenuItem>
      </Menu>
    </>
  );
}

export default DownloadMenu;
