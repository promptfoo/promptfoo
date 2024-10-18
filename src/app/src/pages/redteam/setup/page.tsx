import React, { useState } from 'react';
import CrispChat from '@app/components/CrispChat';
import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';
import Plugins from './components/Plugins';
import Prompts from './components/Prompts';
import Review from './components/Review';
import Setup from './components/Setup';
import Strategies from './components/Strategies';
import Targets from './components/Targets';
import YamlPreview from './components/YamlPreview';
import { useRedTeamConfig } from './hooks/useRedTeamConfig';
import './page.css';

const StyledTabs = styled(Tabs)(({ theme }) => ({
  borderRight: `1px solid ${theme.palette.divider}`,
  '& .MuiTabs-indicator': {
    left: 0,
    right: 'auto',
  },
  width: '240px',
  minWidth: '240px',
}));

const StyledTab = styled(Tab)(({ theme }) => ({
  alignItems: 'flex-start',
  textAlign: 'left',
  '&.Mui-selected': {
    backgroundColor: theme.palette.action.selected,
  },
  maxWidth: 'none',
  width: '100%',
  padding: theme.spacing(2),
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
  backgroundColor: theme.palette.background.default,
  position: 'relative',
}));

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

export default function GeneratePage() {
  const [value, setValue] = useState(0);
  const [yamlPreviewOpen, setYamlPreviewOpen] = useState(false);
  const [setupModalOpen, setSetupModalOpen] = useState(true);
  const { config } = useRedTeamConfig();

  const handleNext = () => {
    setValue((prevValue) => prevValue + 1);
  };

  const handleBack = () => {
    setValue((prevValue) => prevValue - 1);
  };

  const handleChange = (event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
  };

  const toggleYamlPreview = () => {
    setYamlPreviewOpen(!yamlPreviewOpen);
  };

  const closeSetupModal = () => {
    setSetupModalOpen(false);
  };

  return (
    <Root>
      <Content>
        <StyledTabs
          orientation="vertical"
          variant="scrollable"
          value={value}
          onChange={handleChange}
          aria-label="Red Team Config Tabs"
          sx={{ borderRight: 1, borderColor: 'divider', width: 200 }}
        >
          <StyledTab label="Targets" {...a11yProps(0)} />
          <StyledTab label="Application" {...a11yProps(1)} />
          <StyledTab label="Plugins" {...a11yProps(2)} />
          <StyledTab label="Strategies" {...a11yProps(3)} />
          <StyledTab label="Review" {...a11yProps(4)} />
        </StyledTabs>
        <TabContent>
          <CustomTabPanel value={value} index={0}>
            <Targets onNext={handleNext} setupModalOpen={setupModalOpen} />
          </CustomTabPanel>
          <CustomTabPanel value={value} index={1}>
            <Prompts onNext={handleNext} onBack={handleBack} />
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
    </Root>
  );
}
