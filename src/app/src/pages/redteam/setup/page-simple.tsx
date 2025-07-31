import React, { useEffect, useRef, useState } from 'react';

import CrispChat from '@app/components/CrispChat';
import ErrorBoundary from '@app/components/ErrorBoundary';
import { usePageMeta } from '@app/hooks/usePageMeta';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import { callApi } from '@app/utils/api';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import { styled } from '@mui/material/styles';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { REDTEAM_DEFAULTS } from '@promptfoo/redteam/constants';
import { ProviderOptionsSchema } from '@promptfoo/validators/providers';
import yaml from 'js-yaml';
import { useLocation, useNavigate } from 'react-router-dom';
import { customTargetOption, predefinedTargets } from './components/constants';
import Plugins from './components/Plugins';
import Purpose from './components/Purpose';
import Review from './components/Review';
import Setup from './components/Setup';
import Strategies from './components/Strategies';
import Targets from './components/Targets';
import { DEFAULT_HTTP_TARGET, useRedTeamConfig } from './hooks/useRedTeamConfig';
import { useSetupState } from './hooks/useSetupState';
import { generateOrderedYaml } from './utils/yamlHelpers';
import type { RedteamStrategy } from '@promptfoo/types';

import type { Config, RedteamUITarget } from './types';
import './page.css';

const Root = styled(Box)(({ theme }) => ({
  backgroundColor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#fff',
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
}));

const Header = styled(Box)(({ theme }) => ({
  backgroundColor: theme.palette.background.paper,
  borderBottom: `1px solid ${theme.palette.divider}`,
  padding: theme.spacing(0, 3),
  display: 'flex',
  alignItems: 'center',
  minHeight: 56,
}));

const StyledTabs = styled(Tabs)(({ theme }) => ({
  flex: 1,
  '& .MuiTabs-indicator': {
    height: 3,
  },
}));

const StyledTab = styled(Tab)(({ theme }) => ({
  textTransform: 'none',
  minHeight: 56,
  fontWeight: theme.typography.fontWeightRegular,
  fontSize: '0.9375rem',
  '&.Mui-selected': {
    fontWeight: theme.typography.fontWeightMedium,
  },
}));

const HeaderActions = styled(Box)(({ theme }) => ({
  display: 'flex',
  gap: theme.spacing(2),
  marginLeft: theme.spacing(3),
}));

const Content = styled(Box)(({ theme }) => ({
  flex: 1,
  padding: theme.spacing(3),
  maxWidth: 1200,
  margin: '0 auto',
  width: '100%',
}));

interface SavedConfig {
  id: string;
  name: string;
  updatedAt: string;
}

const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
};

export default function RedTeamSetupPageSimple() {
  usePageMeta({ title: 'Red team setup', description: 'Configure red team testing' });
  const location = useLocation();
  const navigate = useNavigate();
  const { recordEvent } = useTelemetry();

  const [value, setValue] = useState(() => {
    const hash = location.hash.replace('#', '');
    return hash ? Number.parseInt(hash, 10) : 0;
  });

  const { hasSeenSetup, markSetupAsSeen } = useSetupState();
  const [setupModalOpen, setSetupModalOpen] = useState(!hasSeenSetup);
  const { config, setFullConfig, resetConfig } = useRedTeamConfig();

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  const [configName, setConfigName] = useState('');
  const toast = useToast();

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const lastSavedConfig = useRef<string>('');

  useEffect(() => {
    const hash = location.hash.replace('#', '');
    if (hash) {
      const newValue = Number.parseInt(hash, 10);
      if (!Number.isNaN(newValue) && newValue >= 0 && newValue <= 4) {
        setValue(newValue);
      }
    }
  }, [location.hash]);

  const handleChange = (event: React.SyntheticEvent, newValue: number) => {
    navigate(`#${newValue}`);
    setValue(newValue);
  };

  const closeSetupModal = () => {
    setSetupModalOpen(false);
    markSetupAsSeen();
  };

  const handleSaveConfig = async () => {
    if (!configName) {
      setSaveDialogOpen(true);
      return;
    }

    try {
      const response = await callApi('/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: configName, type: 'redteam', config }),
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      toast.showToast('Configuration saved successfully', 'success');
      setSaveDialogOpen(false);
      lastSavedConfig.current = JSON.stringify(config);
      setHasUnsavedChanges(false);
    } catch (error) {
      toast.showToast(
        error instanceof Error ? error.message : 'Failed to save configuration',
        'error',
      );
    }
  };

  const loadConfigs = async () => {
    try {
      const response = await callApi('/configs?type=redteam');
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setSavedConfigs(
        data.configs.sort(
          (a: SavedConfig, b: SavedConfig) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        ),
      );
    } catch (error) {
      toast.showToast('Failed to load configurations', 'error');
      setSavedConfigs([]);
    }
  };

  const handleLoadConfig = async (id: string) => {
    try {
      const response = await callApi(`/configs/redteam/${id}`);
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      setFullConfig(data.config);
      setConfigName(data.name);
      lastSavedConfig.current = JSON.stringify(data.config);
      setHasUnsavedChanges(false);
      toast.showToast('Configuration loaded successfully', 'success');
      setLoadDialogOpen(false);
      window.location.reload();
    } catch (error) {
      toast.showToast('Failed to load configuration', 'error');
    }
  };

  const handleDownloadYaml = () => {
    const yamlContent = generateOrderedYaml(config);
    const blob = new Blob([yamlContent], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${configName || 'redteam-config'}.yaml`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleResetConfig = () => {
    resetConfig();
    setConfigName('');
    lastSavedConfig.current = '';
    setHasUnsavedChanges(false);
    setResetDialogOpen(false);
    toast.showToast('Configuration reset to defaults', 'success');
  };

  useEffect(() => {
    if (!configName) {
      setHasUnsavedChanges(false);
      return;
    }
    const currentConfigString = JSON.stringify(config);
    const hasChanges = lastSavedConfig.current !== currentConfigString;
    setHasUnsavedChanges(hasChanges);
  }, [config, configName]);

  const sections = ['Target', 'Context', 'Plugins', 'Strategies', 'Review'];

  return (
    <Root>
      <Header>
        <StyledTabs value={value} onChange={handleChange}>
          {sections.map((label, index) => (
            <StyledTab key={index} label={label} />
          ))}
        </StyledTabs>

        <HeaderActions>
          {hasUnsavedChanges && (
            <Button variant="contained" onClick={handleSaveConfig}>
              Save
            </Button>
          )}
          <Button
            onClick={() => {
              loadConfigs();
              setLoadDialogOpen(true);
            }}
          >
            Load
          </Button>
          <Button onClick={handleDownloadYaml}>Export</Button>
        </HeaderActions>
      </Header>

      <Content>
        {value === 0 && (
          <Targets onNext={() => setValue(1)} onBack={() => {}} setupModalOpen={setupModalOpen} />
        )}
        {value === 1 && <Purpose onNext={() => setValue(2)} />}
        {value === 2 && <Plugins onNext={() => setValue(3)} onBack={() => setValue(1)} />}
        {value === 3 && <Strategies onNext={() => setValue(4)} onBack={() => setValue(2)} />}
        {value === 4 && <Review />}
      </Content>

      <Setup open={setupModalOpen} onClose={closeSetupModal} />
      <CrispChat />

      {/* Save Dialog */}
      <Dialog
        open={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Save Configuration</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Configuration Name"
            fullWidth
            value={configName}
            onChange={(e) => setConfigName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveConfig} variant="contained" disabled={!configName}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Load Dialog */}
      <Dialog
        open={loadDialogOpen}
        onClose={() => setLoadDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Load Configuration</DialogTitle>
        <DialogContent>
          {savedConfigs.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              No saved configurations found
            </Typography>
          ) : (
            <List>
              {savedConfigs.map((config) => (
                <ListItemButton key={config.id} onClick={() => handleLoadConfig(config.id)}>
                  <ListItemText
                    primary={config.name}
                    secondary={new Date(config.updatedAt).toLocaleString()}
                  />
                </ListItemButton>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLoadDialogOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>

      {/* Reset Dialog */}
      <Dialog open={resetDialogOpen} onClose={() => setResetDialogOpen(false)}>
        <DialogTitle>Reset Configuration</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to reset the configuration to default values?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleResetConfig} color="error">
            Reset
          </Button>
        </DialogActions>
      </Dialog>
    </Root>
  );
}
