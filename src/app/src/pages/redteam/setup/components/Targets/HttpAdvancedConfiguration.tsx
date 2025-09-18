import 'prismjs/components/prism-http';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/themes/prism.css';

import React from 'react';

import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import TestTargetConfiguration from './TestTargetConfiguration';
import DigitalSignatureAuthTab from './tabs/DigitalSignatureAuthTab';
import HttpStatusCodeTab from './tabs/HttpStatusCodeTab';
import RequestTransformTab from './tabs/RequestTransformTab';
import ResponseTransformTab from './tabs/ResponseTransformTab';
import SessionsTab from './tabs/SessionsTab';
import TlsHttpsConfigTab from './tabs/TlsHttpsConfigTab';
import TokenEstimationTab from './tabs/TokenEstimationTab';
import type { ProviderOptions } from '@promptfoo/types';

interface HttpAdvancedConfigurationProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: any) => void;
  defaultRequestTransform?: string;
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
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
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
}: HttpAdvancedConfigurationProps) => {
  // Tab state management
  const [activeTab, setActiveTab] = React.useState(0);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  return (
    <>
      <TestTargetConfiguration selectedTarget={selectedTarget} />

      <Box mt={4}>
        <Typography variant="h6" gutterBottom sx={{ mb: 3 }}>
          Advanced Configuration
        </Typography>

        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs
            value={activeTab}
            onChange={handleTabChange}
            aria-label="advanced configuration tabs"
            variant="scrollable"
            scrollButtons="auto"
          >
            <Tab label="Response Transform" {...a11yProps(0)} />
            <Tab label="Request Transform" {...a11yProps(1)} />
            <Tab label="Token Estimation" {...a11yProps(2)} />
            <Tab label="Sessions" {...a11yProps(3)} />
            <Tab label="Digital Signature Auth" {...a11yProps(4)} />
            <Tab label="TLS/HTTPS Config" {...a11yProps(5)} />
            <Tab label="HTTP Status Code" {...a11yProps(6)} />
          </Tabs>
        </Box>

        {/* Response Transform Tab - moved to first position */}
        <TabPanel value={activeTab} index={0}>
          <ResponseTransformTab
            selectedTarget={selectedTarget}
            updateCustomTarget={updateCustomTarget}
          />
        </TabPanel>

        {/* Request Transform Tab */}
        <TabPanel value={activeTab} index={1}>
          <RequestTransformTab
            selectedTarget={selectedTarget}
            updateCustomTarget={updateCustomTarget}
            defaultRequestTransform={defaultRequestTransform}
          />
        </TabPanel>

        {/* Token Estimation Tab */}
        <TabPanel value={activeTab} index={2}>
          <TokenEstimationTab
            selectedTarget={selectedTarget}
            updateCustomTarget={updateCustomTarget}
          />
        </TabPanel>

        {/* Sessions Tab */}
        <TabPanel value={activeTab} index={3}>
          <SessionsTab selectedTarget={selectedTarget} updateCustomTarget={updateCustomTarget} />
        </TabPanel>

        {/* Digital Signature Authentication Tab */}
        <TabPanel value={activeTab} index={4}>
          <DigitalSignatureAuthTab
            selectedTarget={selectedTarget}
            updateCustomTarget={updateCustomTarget}
          />
        </TabPanel>

        {/* TLS/HTTPS Configuration Tab */}
        <TabPanel value={activeTab} index={5}>
          <TlsHttpsConfigTab
            selectedTarget={selectedTarget}
            updateCustomTarget={updateCustomTarget}
          />
        </TabPanel>

        {/* HTTP Status Code Tab */}
        <TabPanel value={activeTab} index={6}>
          <HttpStatusCodeTab
            selectedTarget={selectedTarget}
            updateCustomTarget={updateCustomTarget}
          />
        </TabPanel>
      </Box>
    </>
  );
};

export default HttpAdvancedConfiguration;
