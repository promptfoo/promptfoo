import 'prismjs/components/prism-http';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/themes/prism.css';

import React from 'react';

import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import DigitalSignatureAuthTab from './tabs/DigitalSignatureAuthTab';
import HttpStatusCodeTab from './tabs/HttpStatusCodeTab';
import RequestTransformTab from './tabs/RequestTransformTab';
import SessionsTab from './tabs/SessionsTab';
import TlsHttpsConfigTab from './tabs/TlsHttpsConfigTab';
import TokenEstimationTab from './tabs/TokenEstimationTab';
import type { ProviderOptions } from '@promptfoo/types';

// Enum for tab indices to prevent bugs and improve maintainability
enum TabIndex {
  SessionManagement = 0,
  RequestTransform = 1,
  TokenEstimation = 2,
  DigitalSignatureAuth = 3,
  TlsHttpsConfig = 4,
  HttpStatusCode = 5,
}

interface HttpAdvancedConfigurationProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: any) => void;
  defaultRequestTransform?: string;
  onTargetTested?: (success: boolean) => void;
  onSessionTested?: (success: boolean) => void;
}

// TabPanel component for tab content
interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`advanced-tabpanel-${index}`}
      aria-labelledby={`advanced-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3, px: 2 }}>{children}</Box>}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `advanced-tab-${index}`,
    'aria-controls': `advanced-tabpanel-${index}`,
  };
}

const HttpAdvancedConfiguration = ({
  selectedTarget,
  defaultRequestTransform,
  updateCustomTarget,
  onTargetTested,
  onSessionTested,
}: HttpAdvancedConfigurationProps) => {
  // Tab state management
  const [activeTab, setActiveTab] = React.useState(TabIndex.SessionManagement);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  return (
    <>
      {/* Advanced Configuration Section */}
      <Box mt={4}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs
            value={activeTab}
            onChange={handleTabChange}
            aria-label="advanced configuration tabs"
            variant="scrollable"
            scrollButtons="auto"
          >
            <Tab label="Session Management" {...a11yProps(TabIndex.SessionManagement)} />
            <Tab label="Request Transform" {...a11yProps(TabIndex.RequestTransform)} />
            <Tab label="Token Estimation" {...a11yProps(TabIndex.TokenEstimation)} />
            <Tab label="Digital Signature Auth" {...a11yProps(TabIndex.DigitalSignatureAuth)} />
            <Tab label="TLS/HTTPS Config" {...a11yProps(TabIndex.TlsHttpsConfig)} />
            <Tab label="HTTP Status Code" {...a11yProps(TabIndex.HttpStatusCode)} />
          </Tabs>
        </Box>

        {/* Session Management Tab */}
        <TabPanel value={activeTab} index={TabIndex.SessionManagement}>
          <SessionsTab
            selectedTarget={selectedTarget}
            updateCustomTarget={updateCustomTarget}
            onTestComplete={onSessionTested}
          />
        </TabPanel>

        {/* Request Transform Tab */}
        <TabPanel value={activeTab} index={TabIndex.RequestTransform}>
          <RequestTransformTab
            selectedTarget={selectedTarget}
            updateCustomTarget={updateCustomTarget}
            defaultRequestTransform={defaultRequestTransform}
          />
        </TabPanel>

        {/* Token Estimation Tab */}
        <TabPanel value={activeTab} index={TabIndex.TokenEstimation}>
          <TokenEstimationTab
            selectedTarget={selectedTarget}
            updateCustomTarget={updateCustomTarget}
          />
        </TabPanel>

        {/* Digital Signature Authentication Tab */}
        <TabPanel value={activeTab} index={TabIndex.DigitalSignatureAuth}>
          <DigitalSignatureAuthTab
            selectedTarget={selectedTarget}
            updateCustomTarget={updateCustomTarget}
          />
        </TabPanel>

        {/* TLS/HTTPS Configuration Tab */}
        <TabPanel value={activeTab} index={TabIndex.TlsHttpsConfig}>
          <TlsHttpsConfigTab
            selectedTarget={selectedTarget}
            updateCustomTarget={updateCustomTarget}
          />
        </TabPanel>

        {/* HTTP Status Code Tab */}
        <TabPanel value={activeTab} index={TabIndex.HttpStatusCode}>
          <HttpStatusCodeTab
            selectedTarget={selectedTarget}
            updateCustomTarget={updateCustomTarget}
          />
        </TabPanel>
      </Box>
      <Divider />
    </>
  );
};

export default HttpAdvancedConfiguration;
