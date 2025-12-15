import { useState, useCallback, useMemo } from 'react';

import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import SettingsIcon from '@mui/icons-material/Settings';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { alpha } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import {
  categoryAliases,
  displayNameOverrides,
  type Plugin,
  subCategoryDescriptions,
} from '@promptfoo/redteam/constants';

import type { LocalPluginConfig } from '../types';
import PluginConfigDialog from './PluginConfigDialog';

interface PluginConfigState {
  plugin: Plugin;
  isConfigured: boolean;
  isSkipped: boolean;
}

interface PresetConfigModalProps {
  open: boolean;
  onClose: () => void;
  presetName: string;
  pluginsRequiringConfig: Plugin[];
  pluginConfig: LocalPluginConfig;
  onApplyPreset: (skipPlugins: Plugin[]) => void;
  onConfigSave: (plugin: Plugin, config: LocalPluginConfig[string]) => void;
}

const getPluginDisplayName = (plugin: Plugin): string => {
  return displayNameOverrides[plugin] || categoryAliases[plugin] || plugin;
};

export default function PresetConfigModal({
  open,
  onClose,
  presetName,
  pluginsRequiringConfig,
  pluginConfig,
  onApplyPreset,
  onConfigSave,
}: PresetConfigModalProps) {
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [currentConfigPlugin, setCurrentConfigPlugin] = useState<Plugin | null>(null);
  const [skippedPlugins, setSkippedPlugins] = useState<Set<Plugin>>(new Set());

  // Check if a plugin has been configured
  const isPluginConfigured = useCallback(
    (plugin: Plugin): boolean => {
      const config = pluginConfig[plugin];
      if (!config || Object.keys(config).length === 0) {
        return false;
      }

      for (const key in config) {
        const value = config[key as keyof typeof config];
        if (Array.isArray(value) && value.length === 0) {
          return false;
        }
        if (typeof value === 'string' && value.trim() === '') {
          return false;
        }
      }
      return true;
    },
    [pluginConfig],
  );

  // Build the state for each plugin
  const pluginStates = useMemo((): PluginConfigState[] => {
    return pluginsRequiringConfig.map((plugin) => ({
      plugin,
      isConfigured: isPluginConfigured(plugin),
      isSkipped: skippedPlugins.has(plugin),
    }));
  }, [pluginsRequiringConfig, isPluginConfigured, skippedPlugins]);

  // Check if all plugins are either configured or skipped
  const allPluginsHandled = useMemo(() => {
    return pluginStates.every((state) => state.isConfigured || state.isSkipped);
  }, [pluginStates]);

  const configuredCount = pluginStates.filter((s) => s.isConfigured).length;
  const skippedCount = pluginStates.filter((s) => s.isSkipped).length;
  const pendingCount = pluginStates.filter((s) => !s.isConfigured && !s.isSkipped).length;

  const handleConfigurePlugin = useCallback((plugin: Plugin) => {
    setCurrentConfigPlugin(plugin);
    setConfigDialogOpen(true);
  }, []);

  const handleToggleSkip = useCallback((plugin: Plugin) => {
    setSkippedPlugins((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(plugin)) {
        newSet.delete(plugin);
      } else {
        newSet.add(plugin);
      }
      return newSet;
    });
  }, []);

  const handleConfigDialogClose = useCallback(() => {
    setConfigDialogOpen(false);
    setCurrentConfigPlugin(null);
  }, []);

  const handleConfigSave = useCallback(
    (plugin: Plugin, config: LocalPluginConfig[string]) => {
      onConfigSave(plugin, config);
      setConfigDialogOpen(false);
      setCurrentConfigPlugin(null);
      // If plugin was skipped, remove it from skipped set since it's now configured
      setSkippedPlugins((prev) => {
        const newSet = new Set(prev);
        newSet.delete(plugin);
        return newSet;
      });
    },
    [onConfigSave],
  );

  const handleApply = useCallback(() => {
    onApplyPreset(Array.from(skippedPlugins));
    setSkippedPlugins(new Set());
    onClose();
  }, [onApplyPreset, skippedPlugins, onClose]);

  const handleSkipAll = useCallback(() => {
    onApplyPreset(pluginsRequiringConfig);
    setSkippedPlugins(new Set());
    onClose();
  }, [onApplyPreset, pluginsRequiringConfig, onClose]);

  const handleCancel = useCallback(() => {
    setSkippedPlugins(new Set());
    onClose();
  }, [onClose]);

  return (
    <>
      <Dialog
        open={open && !configDialogOpen}
        onClose={handleCancel}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
            maxHeight: '80vh',
          },
        }}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            pb: 1,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <SettingsIcon sx={{ color: 'primary.main' }} />
            <Typography variant="h6" component="span" sx={{ fontWeight: 600 }}>
              Configure {presetName} Plugins
            </Typography>
          </Box>
          <IconButton onClick={handleCancel} size="small" sx={{ color: 'text.secondary' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ pt: 2 }}>
          <Paper
            variant="outlined"
            sx={(theme) => ({
              p: 2,
              mb: 3,
              bgcolor: alpha(theme.palette.info.main, 0.04),
              borderColor: alpha(theme.palette.info.main, 0.2),
            })}
          >
            <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
              The <strong>{presetName}</strong> preset includes{' '}
              {pluginsRequiringConfig.length === 1
                ? 'a plugin that requires'
                : 'plugins that require'}{' '}
              additional configuration to work effectively. You can configure them now, or skip them
              to continue without these plugins.
            </Typography>
          </Paper>

          {/* Status summary */}
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            {configuredCount > 0 && (
              <Chip
                size="small"
                icon={<CheckCircleIcon />}
                label={`${configuredCount} configured`}
                color="success"
                variant="outlined"
              />
            )}
            {skippedCount > 0 && (
              <Chip
                size="small"
                icon={<RemoveCircleOutlineIcon />}
                label={`${skippedCount} will be skipped`}
                color="warning"
                variant="outlined"
              />
            )}
            {pendingCount > 0 && (
              <Chip
                size="small"
                icon={<ErrorOutlineIcon />}
                label={`${pendingCount} need attention`}
                color="default"
                variant="outlined"
              />
            )}
          </Stack>

          <Divider sx={{ mb: 2 }} />

          {/* Plugin list */}
          <Stack spacing={1.5}>
            {pluginStates.map(({ plugin, isConfigured, isSkipped }) => (
              <Paper
                key={plugin}
                variant="outlined"
                sx={(theme) => ({
                  p: 2,
                  borderColor: isConfigured
                    ? theme.palette.success.main
                    : isSkipped
                      ? alpha(theme.palette.warning.main, 0.5)
                      : theme.palette.divider,
                  bgcolor: isConfigured
                    ? alpha(theme.palette.success.main, 0.04)
                    : isSkipped
                      ? alpha(theme.palette.warning.main, 0.04)
                      : 'background.paper',
                  opacity: isSkipped ? 0.7 : 1,
                  transition: 'all 0.2s ease',
                })}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Typography
                        variant="subtitle2"
                        sx={{
                          fontWeight: 600,
                          textDecoration: isSkipped ? 'line-through' : 'none',
                          color: isSkipped ? 'text.disabled' : 'text.primary',
                        }}
                      >
                        {getPluginDisplayName(plugin)}
                      </Typography>
                      {isConfigured && (
                        <CheckCircleIcon
                          fontSize="small"
                          sx={{ color: 'success.main', fontSize: 18 }}
                        />
                      )}
                    </Box>
                    {subCategoryDescriptions[plugin] && (
                      <Typography
                        variant="body2"
                        sx={{
                          color: isSkipped ? 'text.disabled' : 'text.secondary',
                          fontSize: '0.8125rem',
                          lineHeight: 1.5,
                        }}
                      >
                        {subCategoryDescriptions[plugin]}
                      </Typography>
                    )}
                  </Box>

                  <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                    <Button
                      size="small"
                      variant={isConfigured ? 'outlined' : 'contained'}
                      onClick={() => handleConfigurePlugin(plugin)}
                      disabled={isSkipped}
                      sx={{ minWidth: 90 }}
                    >
                      {isConfigured ? 'Edit' : 'Configure'}
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color={isSkipped ? 'primary' : 'inherit'}
                      onClick={() => handleToggleSkip(plugin)}
                      sx={{
                        minWidth: 70,
                        borderColor: isSkipped ? 'primary.main' : 'divider',
                        color: isSkipped ? 'primary.main' : 'text.secondary',
                      }}
                    >
                      {isSkipped ? 'Include' : 'Skip'}
                    </Button>
                  </Stack>
                </Box>
              </Paper>
            ))}
          </Stack>
        </DialogContent>

        <Divider />

        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={handleCancel} color="inherit" sx={{ color: 'text.secondary' }}>
            Cancel
          </Button>
          <Button onClick={handleSkipAll} color="inherit" variant="outlined">
            Skip All & Continue
          </Button>
          <Button
            onClick={handleApply}
            variant="contained"
            disabled={!allPluginsHandled}
            sx={{ minWidth: 140 }}
          >
            {skippedCount === pluginsRequiringConfig.length
              ? 'Continue Without'
              : skippedCount > 0
                ? `Apply (${configuredCount} plugins)`
                : 'Apply Preset'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Plugin Config Dialog */}
      {currentConfigPlugin && (
        <PluginConfigDialog
          open={configDialogOpen}
          onClose={handleConfigDialogClose}
          plugin={currentConfigPlugin}
          config={pluginConfig[currentConfigPlugin] || {}}
          onSave={handleConfigSave}
        />
      )}
    </>
  );
}
