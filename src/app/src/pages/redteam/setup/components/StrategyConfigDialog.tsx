import { useState, useEffect } from 'react';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

//import { useDebounce } from 'use-debounce';

interface StrategyConfigDialogProps {
  open: boolean;
  strategy: string | null;
  config: Record<string, any>;
  onClose: () => void;
  onSave: (strategy: string, config: Record<string, any>) => void;
}

export default function StrategyConfigDialog({
  open,
  strategy,
  config,
  onClose,
  onSave,
}: StrategyConfigDialogProps) {
  const [localConfig, setLocalConfig] = useState<Record<string, any>>(config);
  /*
  const [debouncedSetLocalConfig] = useDebounce((newConfig: Record<string, any>) => {
    setLocalConfig(newConfig);
  }, 300);
  */

  useEffect(() => {
    if (open && strategy && (!localConfig || Object.keys(localConfig).length === 0)) {
      setLocalConfig(config || {});
    }
  }, [open, strategy, config]);

  const handleArrayInputChange = (key: string, index: number, value: string) => {
    setLocalConfig((prev) => {
      const currentArray = Array.isArray(prev[key]) ? [...prev[key]] : [''];
      currentArray[index] = value;
      return {
        ...prev,
        [key]: currentArray,
      };
    });
  };

  const addArrayItem = (key: string) => {
    setLocalConfig((prev) => ({
      ...prev,
      [key]: [...(Array.isArray(prev[key]) ? prev[key] : []), ''],
    }));
  };

  const removeArrayItem = (key: string, index: number) => {
    setLocalConfig((prev) => {
      const currentArray = Array.isArray(prev[key]) ? [...prev[key]] : [''];
      currentArray.splice(index, 1);
      if (currentArray.length === 0) {
        currentArray.push('');
      }
      return {
        ...prev,
        [key]: currentArray,
      };
    });
  };

  const renderConfigInputs = () => {
    if (!strategy) {
      return null;
    }

    switch (strategy) {
      case 'multilingual':
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Configure target languages for translation. Use language codes (e.g., 'es' for
              Spanish, 'fr' for French).
            </Typography>
            {(localConfig.languages || ['']).map((lang: string, index: number) => (
              <Box key={index} sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  fullWidth
                  value={lang}
                  onChange={(e) => handleArrayInputChange('languages', index, e.target.value)}
                  placeholder="Enter language code"
                  error={!lang.trim()}
                  helperText={lang.trim() ? '' : 'Language code cannot be empty'}
                />
                <IconButton
                  onClick={() => removeArrayItem('languages', index)}
                  disabled={(localConfig.languages || []).length <= 1}
                >
                  <DeleteIcon />
                </IconButton>
              </Box>
            ))}
            <Button
              startIcon={<AddIcon />}
              onClick={() => addArrayItem('languages')}
              sx={{ alignSelf: 'flex-start' }}
            >
              Add Language
            </Button>
          </Box>
        );
      default:
        return (
          <Typography color="text.secondary">
            No configuration options available for this strategy.
          </Typography>
        );
    }
  };

  const handleSave = () => {
    if (strategy && localConfig) {
      if (JSON.stringify(config) !== JSON.stringify(localConfig)) {
        onSave(strategy, localConfig);
      }
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Configure {strategy}</DialogTitle>
      <DialogContent>{renderConfigInputs()}</DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
