import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import CrispChat from '@app/components/CrispChat';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import { callApi } from '@app/utils/api';
import AppIcon from '@mui/icons-material/Apps';
import CloseIcon from '@mui/icons-material/Close';
import PluginIcon from '@mui/icons-material/Extension';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import TargetIcon from '@mui/icons-material/GpsFixed';
import StrategyIcon from '@mui/icons-material/Psychology';
import ReviewIcon from '@mui/icons-material/RateReview';
import SaveIcon from '@mui/icons-material/Save';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';
import Plugins from './components/Plugins';
import Purpose from './components/Purpose';
import Review from './components/Review';
import Setup from './components/Setup';
import Strategies from './components/Strategies';
import Targets from './components/Targets';
import YamlPreview from './components/YamlPreview';
import { useRedTeamConfig } from './hooks/useRedTeamConfig';
import { useSetupState } from './hooks/useSetupState';
import './page.css';

const StyledTabs = styled(Tabs)(({ theme }) => ({
  '& .MuiTabs-indicator': {
    left: 0,
    right: 'auto',
  },
  width: '200px',
  minWidth: '200px',
  backgroundColor: theme.palette.background.paper,
  '& .MuiTab-root': {
    minHeight: '48px',
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

const DrawerHeader = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  padding: theme.spacing(0, 1),
  ...theme.mixins.toolbar,
  justifyContent: 'flex-start',
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

export default function RedTeamSetupPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { recordEvent } = useTelemetry();

  // Get initial tab from URL hash or default to first page
  const [value, setValue] = useState(() => {
    const hash = location.hash.replace('#', '');
    return hash ? Number.parseInt(hash, 10) : 0;
  });

  const [yamlPreviewOpen, setYamlPreviewOpen] = useState(false);
  const { hasSeenSetup, markSetupAsSeen } = useSetupState();
  const [setupModalOpen, setSetupModalOpen] = useState(!hasSeenSetup);
  const { config, setFullConfig } = useRedTeamConfig();

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  const [configName, setConfigName] = useState('');
  const toast = useToast();

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
      return newValue;
    });
  };

  const handleBack = () => {
    setValue((prevValue) => {
      const newValue = prevValue - 1;
      updateHash(newValue);
      return newValue;
    });
  };

  const handleChange = (event: React.SyntheticEvent, newValue: number) => {
    updateHash(newValue);
    setValue(newValue);
  };

  const toggleYamlPreview = () => {
    setYamlPreviewOpen(!yamlPreviewOpen);
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
      setConfigName('');
    } catch (error) {
      console.error('Failed to save configuration', error);
      toast.showToast(
        error instanceof Error ? error.message : 'Failed to save configuration',
        'error',
      );
    }
  };

  const loadConfigs = async () => {
    recordEvent('feature_used', { feature: 'redteam_config_load' });
    try {
      const response = await callApi('/configs?type=redteam');
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

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
      toast.showToast('Configuration loaded successfully', 'success');
      setLoadDialogOpen(false);
    } catch (error) {
      console.error('Failed to load configuration', error);
      toast.showToast(
        error instanceof Error ? error.message : 'Failed to load configuration',
        'error',
      );
    }
  };

  return (
    <Root>
      <Content>
        <OuterSidebarContainer>
          <InnerSidebarContainer>
            <TabsContainer>
              <StyledTabs
                orientation="vertical"
                variant="scrollable"
                value={value}
                onChange={handleChange}
                sx={{ width: 200 }}
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
                  label="Plugins"
                  {...a11yProps(2)}
                />
                <StyledTab
                  icon={<StrategyIcon />}
                  iconPosition="start"
                  label="Strategies"
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
        <Drawer
          anchor="right"
          open={yamlPreviewOpen}
          onClose={toggleYamlPreview}
          variant="persistent"
        >
          <DrawerHeader>
            <IconButton onClick={toggleYamlPreview}>
              <CloseIcon />
            </IconButton>
            <Typography variant="h6" sx={{ ml: 2 }}>
              YAML Preview
            </Typography>
          </DrawerHeader>
          <Box sx={{ height: 'calc(100% - 64px)', overflow: 'auto' }}>
            <YamlPreview config={config} />
          </Box>
        </Drawer>
      </Content>
      {/*
      <Zoom in={!yamlPreviewOpen} unmountOnExit>
        <StyledFab color="primary" onClick={toggleYamlPreview} aria-label="toggle yaml preview">
          <DescriptionIcon />
        </StyledFab>
      </Zoom>
      <Zoom in={yamlPreviewOpen} unmountOnExit>
        <StyledFab color="secondary" onClick={toggleYamlPreview} aria-label="close yaml preview">
          <CloseIcon />
        </StyledFab>
      </Zoom>
      */}
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
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveConfig} disabled={!configName}>
            Save
          </Button>
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
    </Root>
  );
}
