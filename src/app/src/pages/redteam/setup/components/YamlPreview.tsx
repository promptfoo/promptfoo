import React, { useState, useRef } from 'react';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Modal from '@mui/material/Modal';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';
import type { ProviderOptions, UnifiedConfig } from '@promptfoo/types';
import yaml from 'js-yaml';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';
import type { Config } from '../types';
import { generateOrderedYaml } from '../utils/yamlHelpers';

const PreviewContainer = styled(Paper)(({ theme }) => ({
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  backgroundColor: theme.palette.background.paper,
}));

const YamlContent = styled(Box)(({ theme }) => ({
  flexGrow: 1,
  overflow: 'auto',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontFamily: 'monospace',
  fontSize: '0.875rem',
  backgroundColor:
    theme.palette.mode === 'light' ? theme.palette.grey[100] : theme.palette.grey[900],
  color: theme.palette.text.primary,
  padding: '1rem',
  borderRadius: '4px',
  marginBottom: '1rem',
  position: 'relative',
}));

const VisuallyHiddenInput = styled('input')({
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  height: 1,
  overflow: 'hidden',
  position: 'absolute',
  bottom: 0,
  left: 0,
  whiteSpace: 'nowrap',
  width: 1,
});

const CopyButton = styled(IconButton)(({ theme }) => ({
  position: 'absolute',
  top: '0.5rem',
  right: '0.5rem',
  opacity: 0,
  transition: 'opacity 0.2s',
  backgroundColor: theme.palette.background.paper,
  '&:hover': {
    backgroundColor: theme.palette.action.hover,
  },
}));

interface YamlPreviewProps {
  config: Config;
}

export default function YamlPreview({ config }: YamlPreviewProps) {
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importedYaml, setImportedYaml] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { updateConfig } = useRedTeamConfig();
  const [showCopyButton, setShowCopyButton] = useState(false);
  const [copyTooltip, setCopyTooltip] = useState('Copy to clipboard');
  const handleSaveYaml = () => {
    const yamlContent = generateOrderedYaml(config);
    const blob = new Blob([yamlContent], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'promptfooconfig.yaml';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    setImportModalOpen(true);
  };

  const handleCloseModal = () => {
    setImportModalOpen(false);
    setImportError(null);
    setImportedYaml('');
  };

  const validateAndImportYaml = (yamlString: string) => {
    try {
      const parsedYaml = yaml.load(yamlString) as UnifiedConfig & {
        targets?: (string | ProviderOptions)[];
      };
      // Add more detailed validation here
      if (!parsedYaml.description || !parsedYaml.prompts || !parsedYaml.targets) {
        throw new Error('Invalid YAML structure');
      }
      updateConfig('description', parsedYaml.description);
      updateConfig('prompts', parsedYaml.prompts);
      updateConfig('target', Array.isArray(parsedYaml.targets) ? parsedYaml.targets[0] : '');
      updateConfig('plugins', parsedYaml?.redteam?.plugins || []);
      updateConfig('strategies', parsedYaml?.redteam?.strategies || []);
      updateConfig('purpose', parsedYaml?.redteam?.purpose || '');
      updateConfig('entities', parsedYaml?.redteam?.entities || []);
      handleCloseModal();
    } catch (error) {
      setImportError(`Invalid YAML: ${(error as Error).message}`);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setImportedYaml(content);
        validateAndImportYaml(content);
      };
      reader.onerror = () => {
        setImportError('Error reading file');
      };
      reader.readAsText(file);
    }
  };

  const handleCopyYaml = () => {
    const yamlContent = generateOrderedYaml(config);
    navigator.clipboard.writeText(yamlContent).then(() => {
      setCopyTooltip('Copied!');
      setTimeout(() => setCopyTooltip('Copy to clipboard'), 2000);
    });
  };

  return (
    <PreviewContainer elevation={3}>
      <YamlContent
        onMouseEnter={() => setShowCopyButton(true)}
        onMouseLeave={() => setShowCopyButton(false)}
      >
        {generateOrderedYaml(config)}
        <Tooltip title={copyTooltip}>
          <CopyButton
            onClick={handleCopyYaml}
            sx={{ opacity: showCopyButton ? 1 : 0 }}
            size="small"
          >
            <ContentCopyIcon fontSize="small" />
          </CopyButton>
        </Tooltip>
      </YamlContent>
      <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between' }}>
        <Button variant="contained" color="primary" onClick={handleSaveYaml}>
          Save YAML
        </Button>
        <Button variant="outlined" color="primary" onClick={handleImportClick}>
          Import YAML
        </Button>
      </Box>
      <Modal open={importModalOpen} onClose={handleCloseModal} aria-labelledby="import-yaml-modal">
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 400,
            bgcolor: 'background.paper',
            boxShadow: 24,
            p: 4,
          }}
        >
          <Typography variant="h6" id="import-yaml-modal">
            Import YAML
          </Typography>
          <TextField
            multiline
            rows={10}
            fullWidth
            variant="outlined"
            value={importedYaml}
            onChange={(e) => setImportedYaml(e.target.value)}
            error={!!importError}
            helperText={importError}
            placeholder="Paste your YAML here or use the upload button below"
            sx={{ my: 2 }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
            <Button component="label" variant="outlined" startIcon={<CloudUploadIcon />}>
              Upload YAML file
              <VisuallyHiddenInput
                type="file"
                accept=".yaml,.yml"
                ref={fileInputRef}
                onChange={handleFileUpload}
              />
            </Button>
            <Button
              variant="contained"
              color="primary"
              onClick={() => validateAndImportYaml(importedYaml)}
            >
              Import
            </Button>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={handleCloseModal}>Cancel</Button>
          </Box>
        </Box>
      </Modal>
    </PreviewContainer>
  );
}
