import React, { useEffect, useRef, useState } from 'react';

import CrispChat from '@app/components/CrispChat';
import ErrorBoundary from '@app/components/ErrorBoundary';
import { usePageMeta } from '@app/hooks/usePageMeta';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import { callApi } from '@app/utils/api';
import ApiIcon from '@mui/icons-material/Api';
import ChecklistIcon from '@mui/icons-material/Checklist';
import DescriptionIcon from '@mui/icons-material/Description';
import DownloadIcon from '@mui/icons-material/Download';
import ExtensionIcon from '@mui/icons-material/Extension';
import SaveIcon from '@mui/icons-material/Save';
import SecurityIcon from '@mui/icons-material/Security';
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
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { REDTEAM_DEFAULTS } from '@promptfoo/redteam/constants';
import { ProviderOptionsSchema } from '@promptfoo/validators/providers';
import yaml from 'js-yaml';
import { useLocation, useNavigate } from 'react-router-dom';
import { customTargetOption, predefinedTargets } from './components/constants';
// Navigation options (from most to least compact):
// import { SingleLineNavigation } from './components/MinimalStepNav'; // 28px height
// import { NumberedSteps } from './components/MinimalStepNav'; // 32px height
// import { BreadcrumbNavigation } from './components/UltraCompactNav'; // 32px height
// import { DropdownNav } from './components/UltraCompactNav'; // 40px height
import { IconOnlyNav } from './components/UltraCompactNav'; // 40px width - CURRENT
import MoreVertIcon from '@mui/icons-material/MoreVert';
import Divider from '@mui/material/Divider';
import Fab from '@mui/material/Fab';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
// import MinimalTabs from './components/MinimalTabs'; // 48px height
// import SettingsSidebar from './components/SettingsSidebar'; // 240px width
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

const TabPanel = styled(Box)(({ theme }) => ({
  flexGrow: 1,
  padding: theme.spacing(3),
}));

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function CustomTabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <TabPanel
      role="tabpanel"
      hidden={value !== index}
      id={`vertical-tabpanel-${index}`}
      aria-labelledby={`vertical-tab-${index}`}
      {...other}
    >
      {value === index && children}
    </TabPanel>
  );
}

const Root = styled(Box)(({ theme }) => ({
  display: 'flex',
  backgroundColor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#fff',
  minHeight: '100vh',
  position: 'relative',
}));

const SidebarWrapper = styled(Box)({
  position: 'sticky',
  top: 64, // Account for navbar
  height: 'calc(100vh - 64px)',
});

const Content = styled(Box)(({ theme }) => ({
  flexGrow: 1,
  display: 'flex',
  transition: theme.transitions.create('margin', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
}));

const TabContent = styled(Box)(({ theme }) => ({
  flexGrow: 1,
  display: 'flex',
  flexDirection: 'column',
  padding: '24px',
  position: 'relative',
  transition: theme.transitions.create('margin', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
}));

const FloatingMenu = styled(Fab)(({ theme }) => ({
  position: 'fixed',
  bottom: theme.spacing(2),
  right: theme.spacing(2),
  width: 48,
  height: 48,
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

export default function RedTeamSetupPage() {
  // --- Hooks ---
  usePageMeta({ title: 'Red team setup', description: 'Configure red team testing' });
  const location = useLocation();
  const navigate = useNavigate();
  const { recordEvent } = useTelemetry();

  // Get initial tab from URL hash or default to first page
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
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const toast = useToast();

  // Add new state:
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const lastSavedConfig = useRef<string>('');

  // Track funnel on initial load
  useEffect(() => {
    recordEvent('funnel', {
      type: 'redteam',
      step: 'webui_setup_started',
      source: 'webui',
    });
  }, []);

  // Handle browser back/forward
  useEffect(() => {
    const hash = location.hash.replace('#', '');
    if (hash) {
      const newValue = Number.parseInt(hash, 10);
      if (!Number.isNaN(newValue) && newValue >= 0 && newValue <= 4) {
        setValue(newValue);
      } else {
        setValue(0);
      }
    } else {
      setValue(0);
    }
  }, [location.hash]);

  const updateHash = (newValue: number) => {
    if (location.hash !== `#${newValue}`) {
      navigate(`#${newValue}`);
    }
  };

  const handleNext = () => {
    setValue((prevValue) => {
      const newValue = prevValue + 1;
      updateHash(newValue);
      window.scrollTo({ top: 0 });
      return newValue;
    });
  };

  const handleBack = () => {
    setValue((prevValue) => {
      const newValue = prevValue - 1;
      updateHash(newValue);
      window.scrollTo({ top: 0 });
      return newValue;
    });
  };

  const handleChange = (event: React.SyntheticEvent, newValue: number) => {
    updateHash(newValue);
    setValue(newValue);
    window.scrollTo({ top: 0 });

    // Track funnel progress
    const steps = ['targets', 'purpose', 'plugins', 'strategies', 'review'];
    if (newValue < steps.length) {
      recordEvent('funnel', {
        type: 'redteam',
        step: `webui_setup_${steps[newValue]}_viewed`,
        source: 'webui',
      });
    }
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

    recordEvent('feature_used', {
      feature: 'redteam_config_save',
      numPlugins: config.plugins.length,
      numStrategies: config.strategies.length,
      targetType: config.target.id,
    });

    // Track funnel milestone
    recordEvent('funnel', {
      type: 'redteam',
      step: 'webui_setup_configured',
      source: 'webui',
      numPlugins: config.plugins.length,
      numStrategies: config.strategies.length,
      targetType: config.target.id,
    });

    try {
      const response = await callApi('/configs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: configName,
          type: 'redteam',
          config,
        }),
      });
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      toast.showToast('Configuration saved successfully', 'success');
      setSaveDialogOpen(false);
      lastSavedConfig.current = JSON.stringify(config);
      setHasUnsavedChanges(false);
      setConfigName(configName);
    } catch (error) {
      console.error('Failed to save configuration', error);
      toast.showToast(
        error instanceof Error ? error.message : 'Failed to save configuration',
        'error',
      );
    }
  };

  const handleSaveFromDialog = async () => {
    await handleSaveConfig();
  };

  const loadConfigs = async () => {
    recordEvent('feature_used', { feature: 'redteam_config_load' });
    try {
      const response = await callApi('/configs?type=redteam');
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setHasUnsavedChanges(false);

      setSavedConfigs(
        data.configs.sort(
          (a: SavedConfig, b: SavedConfig) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        ),
      );
    } catch (error) {
      console.error('Failed to load configurations', error);
      toast.showToast(
        error instanceof Error ? error.message : 'Failed to load configurations',
        'error',
      );
      setSavedConfigs([]);
    }
  };

  const handleLoadConfig = async (id: string) => {
    try {
      const response = await callApi(`/configs/redteam/${id}`);
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setFullConfig(data.config);
      setConfigName(data.name);
      lastSavedConfig.current = JSON.stringify(data.config);
      setHasUnsavedChanges(false);

      toast.showToast('Configuration loaded successfully', 'success');
      setLoadDialogOpen(false);
      window.location.reload();
    } catch (error) {
      console.error('Failed to load configuration', error);
      toast.showToast(
        error instanceof Error ? error.message : 'Failed to load configuration',
        'error',
      );
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const content = await readFileAsText(file);
      const yamlConfig = yaml.load(content) as any;

      const strategies = yamlConfig?.redteam?.strategies || [];
      let target = yamlConfig.targets?.[0] || yamlConfig.providers?.[0] || DEFAULT_HTTP_TARGET;

      // Convert string targets to objects
      if (typeof target === 'string') {
        const targetType = predefinedTargets.find((t: RedteamUITarget) => t.value === target);

        target = ProviderOptionsSchema.parse({
          id: targetType ? targetType.value : customTargetOption.value,
          label: target,
        });
      }

      const hasAnyStatefulStrategies = strategies.some(
        (strat: RedteamStrategy) => typeof strat !== 'string' && strat?.config?.stateful,
      );
      console.log({ hasAnyStatefulStrategies, strategies });
      if (hasAnyStatefulStrategies) {
        if (typeof target === 'string') {
          target = { id: target, config: { stateful: true } };
        } else {
          target.config = { ...target.config, stateful: true };
        }
      }

      // Map the YAML structure to our expected Config format
      const mappedConfig: Config = {
        description: yamlConfig.description || 'My Red Team Configuration',
        prompts: yamlConfig.prompts || ['{{prompt}}'],
        target,
        plugins: yamlConfig.redteam?.plugins || ['default'],
        strategies,
        purpose: yamlConfig.redteam?.purpose || '',
        entities: yamlConfig.redteam?.entities || [],
        numTests: yamlConfig.redteam?.numTests || REDTEAM_DEFAULTS.NUM_TESTS,
        maxConcurrency: yamlConfig.redteam?.maxConcurrency || REDTEAM_DEFAULTS.MAX_CONCURRENCY,
        applicationDefinition: {
          purpose: yamlConfig.redteam?.purpose || '',
          // We could potentially parse these from redteam.purpose if it follows a specific format.
          redteamUser: '',
          accessToData: '',
          forbiddenData: '',
          accessToActions: '',
          forbiddenActions: '',
          connectedSystems: '',
        },
      };

      setFullConfig(mappedConfig);
      toast.showToast('Configuration loaded successfully', 'success');
      setLoadDialogOpen(false);
    } catch (error) {
      console.error('Failed to load configuration file', error);
      toast.showToast(
        error instanceof Error ? error.message : 'Failed to load configuration file',
        'error',
      );
    }

    // Reset the input
    event.target.value = '';
  };

  // Replace the existing effect with this one
  useEffect(() => {
    if (!configName) {
      setHasUnsavedChanges(false);
      return;
    }

    const currentConfigString = JSON.stringify(config);
    const hasChanges = lastSavedConfig.current !== currentConfigString;
    setHasUnsavedChanges(hasChanges);
  }, [config, configName]);

  // Update handleResetConfig
  const handleResetConfig = () => {
    resetConfig();
    setConfigName('');
    lastSavedConfig.current = '';
    setHasUnsavedChanges(false);
    setResetDialogOpen(false);
    toast.showToast('Configuration reset to defaults', 'success');
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
    recordEvent('feature_used', {
      feature: 'redteam_config_download',
      numPlugins: config.plugins.length,
      numStrategies: config.strategies.length,
      targetType: config.target.id,
    });
  };

  // Create sections data for navigation
  const navSections = [
    {
      id: 'targets',
      label: 'Test Target',
      shortLabel: 'T',
      icon: <ApiIcon />,
      tooltip: 'Configure the target API or application',
    },
    {
      id: 'purpose',
      label: 'Application Context',
      shortLabel: 'C',
      icon: <DescriptionIcon />,
      tooltip: 'Define application purpose and context',
    },
    {
      id: 'plugins',
      label: 'Security Tests',
      shortLabel: 'T',
      icon: <ExtensionIcon />,
      count: config.plugins?.filter((p) => p !== 'default').length || 0,
      tooltip: 'Select security test plugins',
    },
    {
      id: 'strategies',
      label: 'Attack Strategies',
      shortLabel: 'S',
      icon: <SecurityIcon />,
      count: config.strategies?.length || 0,
      tooltip: 'Configure attack strategies',
    },
    {
      id: 'review',
      label: 'Review & Export',
      shortLabel: 'R',
      icon: <ChecklistIcon />,
      tooltip: 'Review configuration and export',
    },
  ];

  // --- JSX ---
  return (
    <Root>
      <Content>
        {/* Using Icon-only navigation (40px width) for maximum space */}
        <SidebarWrapper>
          <IconOnlyNav
            sections={navSections}
            activeSection={value}
            onSectionChange={handleChange}
          />
        </SidebarWrapper>

        {/* Alternative: Use horizontal navigation instead
        <TopNavWrapper>
          <SingleLineNavigation
            sections={navSections}
            activeSection={value}
            onSectionChange={handleChange}
          />
        </TopNavWrapper>
        */}
        <TabContent>
          <CustomTabPanel value={value} index={0}>
            <ErrorBoundary name="Targets Page">
              <Targets onNext={handleNext} onBack={handleBack} setupModalOpen={setupModalOpen} />
            </ErrorBoundary>
          </CustomTabPanel>
          <CustomTabPanel value={value} index={1}>
            <ErrorBoundary name="Application Purpose Page">
              <Purpose onNext={handleNext} />
            </ErrorBoundary>
          </CustomTabPanel>
          <CustomTabPanel value={value} index={2}>
            <ErrorBoundary name="Plugins Page">
              <Plugins onNext={handleNext} onBack={handleBack} />
            </ErrorBoundary>
          </CustomTabPanel>
          <CustomTabPanel value={value} index={3}>
            <ErrorBoundary name="Strategies Page">
              <Strategies onNext={handleNext} onBack={handleBack} />
            </ErrorBoundary>
          </CustomTabPanel>
          <CustomTabPanel value={value} index={4}>
            <ErrorBoundary name="Review Page">
              <Review />
            </ErrorBoundary>
          </CustomTabPanel>
        </TabContent>
      </Content>

      {/* Floating menu for save/load/export */}
      <FloatingMenu
        size="medium"
        onClick={(e) => setMenuAnchor(e.currentTarget)}
        color={hasUnsavedChanges ? 'primary' : 'default'}
      >
        {hasUnsavedChanges ? <SaveIcon /> : <MoreVertIcon />}
      </FloatingMenu>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <MenuItem
          onClick={() => {
            handleSaveConfig();
            setMenuAnchor(null);
          }}
        >
          <SaveIcon sx={{ mr: 1, fontSize: 20 }} />
          {hasUnsavedChanges ? 'Save changes' : 'Save as...'}
        </MenuItem>
        <MenuItem
          onClick={() => {
            loadConfigs();
            setLoadDialogOpen(true);
            setMenuAnchor(null);
          }}
        >
          <ApiIcon sx={{ mr: 1, fontSize: 20 }} />
          Load configuration
        </MenuItem>
        <MenuItem
          onClick={() => {
            handleDownloadYaml();
            setMenuAnchor(null);
          }}
        >
          <DownloadIcon sx={{ mr: 1, fontSize: 20 }} />
          Export YAML
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            setResetDialogOpen(true);
            setMenuAnchor(null);
          }}
          sx={{ color: 'error.main' }}
        >
          <SecurityIcon sx={{ mr: 1, fontSize: 20 }} />
          Reset to defaults
        </MenuItem>
      </Menu>

      <Setup open={setupModalOpen} onClose={closeSetupModal} />
      <CrispChat />
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
            sx={{ mb: 2 }}
          />
          <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={handleDownloadYaml}
              fullWidth
            >
              Export YAML
            </Button>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSaveFromDialog}
              disabled={!configName}
              fullWidth
            >
              Save
            </Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={loadDialogOpen}
        onClose={() => setLoadDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Load Configuration</DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2 }}>
            <input
              accept=".yml,.yaml"
              style={{ display: 'none' }}
              id="yaml-file-upload"
              type="file"
              onChange={handleFileUpload}
            />
            <label htmlFor="yaml-file-upload">
              <Button variant="outlined" component="span" fullWidth sx={{ mb: 2 }}>
                Upload YAML File
              </Button>
            </label>
          </Box>
          <Typography variant="subtitle2" sx={{ mb: 2 }}>
            Or choose a saved configuration:
          </Typography>
          {savedConfigs.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">No saved configurations found</Typography>
            </Box>
          ) : (
            <List>
              {savedConfigs.map((config) => (
                <ListItemButton
                  key={config.id}
                  onClick={() => handleLoadConfig(config.id)}
                  sx={{
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    mb: 0.5,
                    backgroundColor: 'background.paper',
                    '&:hover': {
                      backgroundColor: 'action.hover',
                      cursor: 'pointer',
                    },
                  }}
                >
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

      <Dialog
        open={resetDialogOpen}
        onClose={() => setResetDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Reset Configuration</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to reset the configuration to default values? This action cannot
            be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={() => {
              handleResetConfig();
            }}
            color="error"
          >
            Reset
          </Button>
        </DialogActions>
      </Dialog>
    </Root>
  );
}
