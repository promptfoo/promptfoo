import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import CrispChat from '@app/components/CrispChat';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import { callApi } from '@app/utils/api';
import AppIcon from '@mui/icons-material/Apps';
import DownloadIcon from '@mui/icons-material/Download';
import PluginIcon from '@mui/icons-material/Extension';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import TargetIcon from '@mui/icons-material/GpsFixed';
import StrategyIcon from '@mui/icons-material/Psychology';
import ReviewIcon from '@mui/icons-material/RateReview';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SaveIcon from '@mui/icons-material/Save';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';
import type { RedteamStrategy } from '@promptfoo/types';
import { ProviderOptionsSchema } from '@promptfoo/validators/providers';
import yaml from 'js-yaml';
import Plugins from './components/Plugins';
import Purpose from './components/Purpose';
import Review from './components/Review';
import Setup from './components/Setup';
import Strategies from './components/Strategies';
import Targets from './components/Targets';
import { predefinedTargets, customTargetOption } from './components/constants';
import { DEFAULT_HTTP_TARGET, useRedTeamConfig } from './hooks/useRedTeamConfig';
import { useSetupState } from './hooks/useSetupState';
import type { RedteamUITarget } from './types';
import type { Config } from './types';
import { generateOrderedYaml } from './utils/yamlHelpers';
import './page.css';

const StyledTabs = styled(Tabs)(({ theme }) => ({
  '& .MuiTabs-indicator': {
    left: 0,
    right: 'auto',
  },
  width: '100%',
  backgroundColor: theme.palette.background.paper,
  '& .MuiTab-root': {
    minHeight: '48px',
  },
  '& .MuiTabs-scrollButtons': {
    display: 'none',
  },
}));

const StyledTab = styled(Tab)(({ theme }) => ({
  alignItems: 'center',
  textAlign: 'left',
  justifyContent: 'flex-start',
  '&.Mui-selected': {
    backgroundColor: theme.palette.action.selected,
  },
  maxWidth: 'none',
  width: '100%',
  minHeight: '48px',
  padding: theme.spacing(1, 2),
  borderBottom: `1px solid ${theme.palette.divider}`,
  '& .MuiSvgIcon-root': {
    marginRight: theme.spacing(1),
    fontSize: '18px',
  },
  textTransform: 'none',
  fontSize: '0.875rem',
}));

const SidebarButtons = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(0.5),
  padding: theme.spacing(1.5),
  borderTop: `1px solid ${theme.palette.divider}`,
  backgroundColor: theme.palette.background.paper,
}));

const SidebarButton = styled(Button)(({ theme }) => ({
  justifyContent: 'flex-start',
  padding: theme.spacing(1),
  textTransform: 'none',
  color: theme.palette.text.secondary,
  fontSize: '0.875rem',
  fontWeight: 400,
  '& .MuiSvgIcon-root': {
    marginRight: theme.spacing(1),
    fontSize: '18px',
  },
  '&:hover': {
    backgroundColor: theme.palette.action.hover,
    color: theme.palette.text.primary,
  },
}));

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

function a11yProps(index: number) {
  return {
    id: `vertical-tab-${index}`,
    'aria-controls': `vertical-tabpanel-${index}`,
  };
}

const Root = styled(Box)(({ theme }) => ({
  display: 'flex',
  backgroundColor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#fff',
  minHeight: '100vh',
  position: 'relative',
}));

const OuterSidebarContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: '280px',
  minWidth: '280px',
  borderRight: `1px solid ${theme.palette.divider}`,
}));

const InnerSidebarContainer = styled(Box)({
  position: 'sticky',
  top: 64, // Account for navbar
  height: 'calc(100vh - 64px)',
  display: 'flex',
  flexDirection: 'column',
});

const TabsContainer = styled(Box)({
  flexGrow: 1,
  overflowY: 'auto',
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

/*
const StyledFab = styled(Fab)(({ theme }) => ({
  position: 'fixed',
  bottom: theme.spacing(2),
  right: theme.spacing(2),
}));
*/

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

// Update the StatusSection styling
const StatusSection = styled(Box)(({ theme }) => ({
  padding: theme.spacing(2),
  borderBottom: `1px solid ${theme.palette.divider}`,
  borderRight: `1px solid ${theme.palette.divider}`,
  backgroundColor: theme.palette.background.paper,
  width: '280px',
  minWidth: '280px',
  '& .configName': {
    fontSize: '1rem',
    fontWeight: 500,
    color: theme.palette.text.primary,
    marginBottom: theme.spacing(0.5),
  },
  '& .statusRow': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing(1),
  },
  '& .unsavedChanges': {
    fontSize: '0.875rem',
    color: theme.palette.warning.main,
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
  },
  '& .saveButton': {
    minWidth: 'auto',
    padding: theme.spacing(0.5, 1),
  },
  '& .dateText': {
    fontSize: '0.875rem',
    color: theme.palette.text.secondary,
  },
}));

export default function RedTeamSetupPage() {
  // --- Hooks ---
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
  const toast = useToast();

  // Add new state:
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Add new state for tracking the config date
  const [configDate, setConfigDate] = useState<string | null>(null);

  const lastSavedConfig = useRef<string>('');

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
  };

  const closeSetupModal = () => {
    setSetupModalOpen(false);
    markSetupAsSeen();
  };

  const handleSaveConfig = async () => {
    recordEvent('feature_used', {
      feature: 'redteam_config_save',
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
      setConfigDate(data.createdAt);
    } catch (error) {
      console.error('Failed to save configuration', error);
      toast.showToast(
        error instanceof Error ? error.message : 'Failed to save configuration',
        'error',
      );
    }

    setHasUnsavedChanges(false);
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
      setConfigDate(data.updatedAt);
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

  // --- JSX ---
  return (
    <Root>
      <Content>
        <OuterSidebarContainer>
          <InnerSidebarContainer>
            <StatusSection>
              <Typography className="configName">
                {configName ? `Config: ${configName}` : 'New Configuration'}
              </Typography>
              {hasUnsavedChanges ? (
                <div className="statusRow">
                  <Typography className="unsavedChanges">
                    <span>●</span> Unsaved changes
                  </Typography>
                  <Button
                    className="saveButton"
                    size="small"
                    variant="outlined"
                    color="warning"
                    onClick={handleSaveConfig}
                    disabled={!configName}
                  >
                    Save now
                  </Button>
                </div>
              ) : (
                configDate && (
                  <Typography className="dateText" color="text.secondary" variant="body2">
                    {new Date(configDate).toLocaleString()}
                  </Typography>
                )
              )}
            </StatusSection>
            <TabsContainer>
              <StyledTabs
                orientation="vertical"
                variant="scrollable"
                value={value}
                onChange={handleChange}
              >
                <StyledTab
                  icon={<AppIcon />}
                  iconPosition="start"
                  label="Application"
                  {...a11yProps(0)}
                />
                <StyledTab
                  icon={<TargetIcon />}
                  iconPosition="start"
                  label="Targets"
                  {...a11yProps(1)}
                />
                <StyledTab
                  icon={<PluginIcon />}
                  iconPosition="start"
                  label={`Plugins${config.plugins?.length ? ` (${config.plugins.length})` : ''}`}
                  {...a11yProps(2)}
                />
                <StyledTab
                  icon={<StrategyIcon />}
                  iconPosition="start"
                  label={`Strategies${config.strategies?.length ? ` (${config.strategies.length})` : ''}`}
                  {...a11yProps(3)}
                />
                <StyledTab
                  icon={<ReviewIcon />}
                  iconPosition="start"
                  label="Review"
                  {...a11yProps(4)}
                />
              </StyledTabs>
            </TabsContainer>
            <SidebarButtons>
              <SidebarButton
                variant="text"
                fullWidth
                startIcon={<SaveIcon />}
                onClick={() => setSaveDialogOpen(true)}
              >
                Save Config
              </SidebarButton>
              <SidebarButton
                variant="text"
                fullWidth
                startIcon={<FolderOpenIcon />}
                onClick={() => {
                  loadConfigs();
                  setLoadDialogOpen(true);
                }}
              >
                Load Config
              </SidebarButton>
              <SidebarButton
                variant="text"
                fullWidth
                startIcon={<RestartAltIcon />}
                onClick={() => setResetDialogOpen(true)}
              >
                Reset Config
              </SidebarButton>
            </SidebarButtons>
          </InnerSidebarContainer>
        </OuterSidebarContainer>
        <TabContent>
          <CustomTabPanel value={value} index={0}>
            <Purpose onNext={handleNext} />
          </CustomTabPanel>
          <CustomTabPanel value={value} index={1}>
            <Targets onNext={handleNext} onBack={handleBack} setupModalOpen={setupModalOpen} />
          </CustomTabPanel>
          <CustomTabPanel value={value} index={2}>
            <Plugins onNext={handleNext} onBack={handleBack} />
          </CustomTabPanel>
          <CustomTabPanel value={value} index={3}>
            <Strategies onNext={handleNext} onBack={handleBack} />
          </CustomTabPanel>
          <CustomTabPanel value={value} index={4}>
            <Review />
          </CustomTabPanel>
        </TabContent>
      </Content>

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
              onClick={handleSaveConfig}
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
