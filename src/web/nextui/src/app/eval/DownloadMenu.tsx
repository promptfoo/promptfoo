import * as React from 'react';

import yaml from 'js-yaml';
import Button from '@mui/material/Button';
import DownloadIcon from '@mui/icons-material/Download';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';

import { useStore as useResultsViewStore } from './store';

function DownloadMenu({ fileName }: { fileName: string }) {
  const { table, config } = useResultsViewStore();
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
    const formattedData = [];
    for (const row of table.body) {
      const chosen = row.outputs.filter((output) => output.pass).map((output) => output.text);
      const rejected = row.outputs.filter((output) => !output.pass).map((output) => output.text);

      if (!row.test.vars?.question) {
        alert(`question var not present in row:\n\n${JSON.stringify(row)}`);
        return;
      }
      if (!row.test.vars?.system) {
        alert(`system var not present in row:\n\n${JSON.stringify(row)}`);
        return;
      }
      const question = row.test.vars.question;
      const system = row.test.vars.system;
      formattedData.push({
        system,
        question,
        chosen,
        rejected,
      });
    }
    const blob = new Blob([JSON.stringify(formattedData, null, 2)], { type: 'application/json' });
    openDownloadDialog(blob, `${fileName}-dpo.json`);
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
        <MenuItem onClick={downloadDpoJson}>DPO JSON</MenuItem>
      </Menu>
    </>
  );
}

export default DownloadMenu;
