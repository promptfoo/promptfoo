import React from 'react';
import Check from '@mui/icons-material/Check';
import Download from '@mui/icons-material/Download';
import FileCopy from '@mui/icons-material/FileCopy';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useStore } from './store';

interface ConfigModalProps {
  open: boolean;
  onClose: () => void;
}

export default function ConfigModal({ open, onClose }: ConfigModalProps) {
  const { config } = useStore();
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = React.useState(false);
  const [yamlConfig, setYamlConfig] = React.useState('');

  React.useEffect(() => {
    if (open) {
      (async () => {
        const { default: yaml } = await import('js-yaml');
        setYamlConfig(yaml.dump(config));
      })();
    }
  }, [open, config]);

  const handleCopyClick = () => {
    if (textareaRef.current) {
      textareaRef.current.select();
      document.execCommand('copy');
      setCopied(true);
    }
  };

  const handleDownloadClick = () => {
    const blob = new Blob([yamlConfig], { type: 'text/yaml;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = 'config.yaml';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
  };

  const handleClose = () => {
    setCopied(false);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      aria-labelledby="config-dialog-title"
      maxWidth="md"
      fullWidth
    >
      <DialogTitle id="config-dialog-title">
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6" style={{ flexGrow: 1 }}>
            Config
          </Typography>
          <Box>
            <Tooltip title="Copy to clipboard">
              <IconButton onClick={handleCopyClick}>{copied ? <Check /> : <FileCopy />}</IconButton>
            </Tooltip>
            <Tooltip title="Download .yaml">
              <IconButton onClick={handleDownloadClick}>
                <Download />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body1" component="div">
          <textarea
            ref={textareaRef}
            readOnly
            value={yamlConfig}
            style={{
              width: '100%',
              minHeight: '400px',
              fontFamily: 'monospace',
              border: '1px solid #ccc',
            }}
          />
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="primary">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
