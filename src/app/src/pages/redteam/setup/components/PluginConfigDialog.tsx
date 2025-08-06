import { useEffect, useState } from 'react';

import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';
import type { Plugin } from '@promptfoo/redteam/constants';
import type { PluginConfig } from '@promptfoo/redteam/types';

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
  const { config: redTeamConfig } = useRedTeamConfig();
  // Initialize with provided config
  const [localConfig, setLocalConfig] = useState<LocalPluginConfig[string]>(config);

  // Update localConfig when config prop changes
  useEffect(() => {
    if (open && plugin && (!localConfig || Object.keys(localConfig).length === 0)) {
      setLocalConfig(config || {});
    }
  }, [open, plugin, config]);

  const handleArrayInputChange = (key: string, index: number, value: string) => {
    setLocalConfig((prev) => {
      const currentArray = Array.isArray(prev[key as keyof PluginConfig])
        ? [...(prev[key as keyof PluginConfig] as string[])]
        : [''];
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
      [key]: [
        ...(Array.isArray(prev[key as keyof PluginConfig])
          ? (prev[key as keyof PluginConfig] as string[])
          : []),
        '',
      ],
    }));
  };

  const removeArrayItem = (key: string, index: number) => {
    setLocalConfig((prev) => {
      const currentArray = Array.isArray(prev[key as keyof PluginConfig])
        ? [...(prev[key as keyof PluginConfig] as string[])]
        : [''];
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

  const hasEmptyArrayItems = (array: string[] | undefined) => {
    return array?.some((item) => item.trim() === '') ?? false;
  };

  const renderConfigInputs = () => {
    if (!plugin) {
      return null;
    }

    switch (plugin) {
      case 'policy':
        // Show read-only list of all configured policies
        const policyPlugins = redTeamConfig.plugins.filter(
          (p): p is { id: string; config: any } =>
            typeof p === 'object' && 'id' in p && p.id === 'policy',
        );

        if (policyPlugins.length === 0) {
          return (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
              No custom policies configured. Add policies in the Custom Policies section.
            </Typography>
          );
        }

        return (
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 2 }}>
              Configured Custom Policies ({policyPlugins.length})
            </Typography>
            {policyPlugins.map((policyPlugin, index) => (
              <Paper
                key={index}
                variant="outlined"
                sx={{ p: 2, mb: 2, backgroundColor: 'grey.50' }}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mb: 1, display: 'block' }}
                >
                  Policy {index + 1}
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                  {policyPlugin.config.policy || 'No policy text'}
                </Typography>
              </Paper>
            ))}
            <Typography variant="caption" color="text.secondary">
              To edit or add policies, use the Custom Policies section in Available Plugins.
            </Typography>
          </Box>
        );
      case 'intent':
        // Show read-only list of all configured custom intents
        const intentPlugin = redTeamConfig.plugins.find(
          (p): p is { id: string; config: any } =>
            typeof p === 'object' && 'id' in p && p.id === 'intent',
        );

        if (!intentPlugin?.config?.intent) {
          return (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
              No custom intents configured. Add intents in the Custom Prompts section.
            </Typography>
          );
        }

        const intents = intentPlugin.config.intent;
        const flatIntents = intents
          .flat()
          .filter((intent: any) => typeof intent === 'string' && intent.trim());

        if (flatIntents.length === 0) {
          return (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
              No custom intents configured. Add intents in the Custom Prompts section.
            </Typography>
          );
        }

        return (
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 2 }}>
              Configured Custom Intents ({flatIntents.length})
            </Typography>
            {flatIntents.map((intent: string, index: number) => (
              <Paper
                key={index}
                variant="outlined"
                sx={{ p: 2, mb: 2, backgroundColor: 'grey.50' }}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mb: 1, display: 'block' }}
                >
                  Intent {index + 1}
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                  {intent}
                </Typography>
              </Paper>
            ))}
            <Typography variant="caption" color="text.secondary">
              To edit or add intents, use the Custom Prompts section in Available Plugins.
            </Typography>
          </Box>
        );
      case 'prompt-extraction':
        const key = 'systemPrompt';
        return (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              The Prompt Extraction plugin tests whether an attacker can extract your system prompt
              through various techniques. Provide your actual system prompt here so the plugin can
              test if it can be extracted.
            </Typography>
            <TextField
              fullWidth
              multiline
              rows={4}
              label="System Prompt"
              variant="outlined"
              margin="normal"
              value={localConfig[key] || ''}
              onChange={(e) => setLocalConfig({ ...localConfig, [key]: e.target.value })}
            />
          </Box>
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

        const getExplanation = () => {
          switch (plugin) {
            case 'bfla':
              return "BFLA (Broken Function Level Authorization) tests whether users can access functions they shouldn't. Specify function names, API endpoints, or identifiers that should have restricted access.";
            case 'bola':
              return "BOLA (Broken Object Level Authorization) tests whether users can access objects they shouldn't own. Specify system names, object IDs, or resource identifiers to test authorization controls.";
            case 'ssrf':
              return 'SSRF (Server-Side Request Forgery) tests whether your application can be tricked into making requests to unintended destinations. Specify URLs or endpoints that should not be accessible.';
            default:
              return '';
          }
        };

        // Ensure we always have at least one item
        const currentArray = (localConfig[arrayKey] as string[]) || [''];
        return (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {getExplanation()}
            </Typography>
            {currentArray.map((item: string, index: number) => (
              <Box key={index} sx={{ display: 'flex', alignItems: 'center', my: 1 }}>
                <TextField
                  fullWidth
                  label={`${arrayKeyToLabel(arrayKey)} ${index + 1}`}
                  variant="outlined"
                  value={item}
                  onChange={(e) => handleArrayInputChange(arrayKey, index, e.target.value)}
                  sx={{ mr: 1 }}
                />
                {/* Only show remove button if there's more than one item */}
                {currentArray.length > 1 && (
                  <IconButton onClick={() => removeArrayItem(arrayKey, index)} size="small">
                    <RemoveIcon />
                  </IconButton>
                )}
              </Box>
            ))}
            <Button
              startIcon={<AddIcon />}
              onClick={() => addArrayItem(arrayKey)}
              variant="outlined"
              size="small"
              sx={{ mt: 1 }}
              disabled={hasEmptyArrayItems(currentArray)}
            >
              Add
            </Button>
          </Box>
        );
      case 'indirect-prompt-injection':
        return (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Indirect Prompt Injection tests whether untrusted content can influence your AI
              system's behavior. This happens when user-generated content or external data (like
              from RAG systems) contains malicious instructions. Specify the variable name in your
              prompt that contains untrusted data (e.g., 'name', 'userContent', 'document').
            </Typography>
            <TextField
              fullWidth
              label="Indirect Injection Variable"
              variant="outlined"
              margin="normal"
              value={localConfig.indirectInjectionVar || ''}
              onChange={(e) =>
                setLocalConfig({ ...localConfig, indirectInjectionVar: e.target.value })
              }
              placeholder="e.g., name, userContent, document"
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              {`Example: If your prompt is "Hello {{name}}, how can I help?" and user data goes into the 'name' variable, enter "name" above.`}
            </Typography>
          </Box>
        );
      default:
        return null;
    }
  };

  const handleSave = () => {
    if (plugin && localConfig) {
      if (JSON.stringify(config) !== JSON.stringify(localConfig)) {
        onSave(plugin, localConfig);
      }
      onClose();
    }
  };

  const isReadOnlyPlugin = plugin === 'policy' || plugin === 'intent';

  const getDialogTitle = () => {
    if (plugin === 'policy') {
      return 'View Custom Policies';
    }
    if (plugin === 'intent') {
      return 'View Custom Intents';
    }
    return `Configure ${plugin}`;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{getDialogTitle()}</DialogTitle>
      <DialogContent>{renderConfigInputs()}</DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{isReadOnlyPlugin ? 'Close' : 'Cancel'}</Button>
        {!isReadOnlyPlugin && (
          <Button onClick={handleSave} variant="contained">
            Save
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

const arrayKeyToLabel = (key: string) => {
  switch (key) {
    case 'targetIdentifiers':
      return 'Target Identifier';
    case 'targetSystems':
      return 'Target System';
    case 'targetUrls':
      return 'Target URL';
  }
};
