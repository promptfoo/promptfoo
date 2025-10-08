import { useCallback, useEffect, useState } from 'react';

import JsonTextField from '@app/components/JsonTextField';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

interface ProviderConfigDialogProps {
  open: boolean;
  providerId: string;
  config?: Record<string, any>;
  onClose: () => void;
  onSave: (providerId: string, config: Record<string, any>) => void;
}

// Common config templates for quick starts
const CONFIG_TEMPLATES: Record<string, Record<string, any>> = {
  'openai:': {
    temperature: 0.7,
    max_tokens: 2048,
  },
  'anthropic:': {
    temperature: 0.7,
    max_tokens: 4096,
  },
  'azure:': {
    deployment_id: 'your-deployment-name',
    api_version: '2024-02-01',
  },
};

// Provider documentation links
const PROVIDER_DOCS: Record<string, string> = {
  openai: 'https://www.promptfoo.dev/docs/providers/openai/',
  anthropic: 'https://www.promptfoo.dev/docs/providers/anthropic/',
  azure: 'https://www.promptfoo.dev/docs/providers/azure/',
  bedrock: 'https://www.promptfoo.dev/docs/providers/aws-bedrock/',
  vertex: 'https://www.promptfoo.dev/docs/providers/vertex/',
  ollama: 'https://www.promptfoo.dev/docs/providers/ollama/',
  replicate: 'https://www.promptfoo.dev/docs/providers/replicate/',
};

const ProviderConfigDialog = ({
  open,
  providerId,
  config = {},
  onClose,
  onSave,
}: ProviderConfigDialogProps) => {
  const [localConfig, setLocalConfig] = useState<Record<string, any>>({});
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Extract provider type from ID (e.g., "openai:gpt-4" -> "openai")
  const providerType = providerId.split(':')[0];
  const docUrl = PROVIDER_DOCS[providerType];

  useEffect(() => {
    if (open) {
      setLocalConfig({ ...config });
      setJsonError(null);
    }
  }, [open, providerId, config]);

  const handleSave = useCallback(() => {
    if (jsonError) {
      return;
    }
    onSave(providerId, localConfig);
    onClose();
  }, [jsonError, providerId, localConfig, onSave, onClose]);

  const handleUseTemplate = (templateKey: string) => {
    const template = CONFIG_TEMPLATES[templateKey];
    setLocalConfig({ ...localConfig, ...template });
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, handleSave, onClose]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        <Box>
          <Typography variant="h6">Provider Configuration</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
            {providerId}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        {docUrl && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2">
              View the{' '}
              <Link href={docUrl} target="_blank" rel="noopener">
                {providerType} provider documentation
              </Link>{' '}
              for all available configuration options.
            </Typography>
          </Alert>
        )}

        {Object.keys(CONFIG_TEMPLATES).some((key) => providerId.startsWith(key)) && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Quick start templates:
            </Typography>
            <Stack direction="row" spacing={1}>
              {Object.keys(CONFIG_TEMPLATES)
                .filter((key) => providerId.startsWith(key))
                .map((key) => (
                  <Chip
                    key={key}
                    label={`Use ${key.replace(':', '')} defaults`}
                    onClick={() => handleUseTemplate(key)}
                    size="small"
                    variant="outlined"
                  />
                ))}
            </Stack>
          </Box>
        )}

        {jsonError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {jsonError}
          </Alert>
        )}

        <JsonTextField
          key={`${providerId}-${open}`}
          label="Configuration (JSON)"
          defaultValue={JSON.stringify(localConfig, null, 2)}
          onChange={(parsed, error) => {
            if (error) {
              setJsonError(error);
            } else {
              setJsonError(null);
              setLocalConfig(parsed);
            }
          }}
          fullWidth
          multiline
          minRows={15}
          maxRows={30}
          error={!!jsonError}
          helperText={
            jsonError ||
            'Enter your provider configuration as JSON. Press Ctrl+S to save, Escape to cancel.'
          }
        />

        {Object.keys(localConfig).length > 0 && !jsonError && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary">
              Configured fields: {Object.keys(localConfig).join(', ')}
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={!!jsonError}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProviderConfigDialog;
