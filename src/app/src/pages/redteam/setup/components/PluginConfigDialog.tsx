import { useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import type { Plugin } from '@promptfoo/redteam/constants';
import type { LocalPluginConfig } from '../types';

interface PluginConfigDialogProps {
  open: boolean;
  plugin: Plugin | null;
  config: LocalPluginConfig[string];
  onClose: () => void;
  onSave: (plugin: Plugin, config: LocalPluginConfig[string]) => void;
}

export default function PluginConfigDialog({
  open,
  plugin,
  config,
  onClose,
  onSave,
}: PluginConfigDialogProps) {
  const [localConfig, setLocalConfig] = useState<LocalPluginConfig[string]>(config || {});

  const handleArrayInputChange = (key: string, index: number, value: string) => {
    setLocalConfig((prev) => ({
      ...prev,
      [key]: [...((prev[key] as string[]) || [])].map((item, i) => (i === index ? value : item)),
    }));
  };

  const addArrayItem = (key: string) => {
    setLocalConfig((prev) => ({
      ...prev,
      [key]: [...((prev[key] as string[]) || []), ''],
    }));
  };

  const removeArrayItem = (key: string, index: number) => {
    setLocalConfig((prev) => ({
      ...prev,
      [key]: ((prev[key] as string[]) || []).filter((_, i) => i !== index),
    }));
  };

  const renderConfigInputs = () => {
    if (!plugin) {
      return null;
    }

    switch (plugin) {
      case 'policy':
      case 'prompt-extraction':
        const key = plugin === 'policy' ? 'policy' : 'systemPrompt';
        return (
          <TextField
            fullWidth
            multiline
            rows={4}
            label={plugin === 'policy' ? 'Policy' : 'System Prompt'}
            variant="outlined"
            margin="normal"
            value={localConfig[key] || ''}
            onChange={(e) => setLocalConfig({ ...localConfig, [key]: e.target.value })}
          />
        );
      case 'bfla':
      case 'bola':
      case 'ssrf':
        const arrayKey =
          plugin === 'bfla'
            ? 'targetIdentifiers'
            : plugin === 'bola'
              ? 'targetSystems'
              : 'targetUrls';
        return (
          <>
            {((localConfig[arrayKey] as string[]) || ['']).map((item: string, index: number) => (
              <Box key={index} sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <TextField
                  fullWidth
                  label={`${arrayKey} ${index + 1}`}
                  variant="outlined"
                  value={item}
                  onChange={(e) => handleArrayInputChange(arrayKey, index, e.target.value)}
                  sx={{ mr: 1 }}
                />
                <IconButton onClick={() => removeArrayItem(arrayKey, index)} size="small">
                  <RemoveIcon />
                </IconButton>
              </Box>
            ))}
            <Button
              startIcon={<AddIcon />}
              onClick={() => addArrayItem(arrayKey)}
              variant="outlined"
              size="small"
              sx={{ mt: 1 }}
            >
              New
            </Button>
          </>
        );
      case 'indirect-prompt-injection':
        return (
          <TextField
            fullWidth
            label="Indirect Injection Variable"
            variant="outlined"
            margin="normal"
            value={localConfig.indirectInjectionVar || ''}
            onChange={(e) =>
              setLocalConfig({ ...localConfig, indirectInjectionVar: e.target.value })
            }
          />
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Configure {plugin}</DialogTitle>
      <DialogContent>{renderConfigInputs()}</DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={() => {
            if (plugin) {
              onSave(plugin, localConfig);
              onClose();
            }
          }}
          variant="contained"
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
