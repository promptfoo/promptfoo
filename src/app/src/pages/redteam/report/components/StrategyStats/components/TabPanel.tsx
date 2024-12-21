import React from 'react';
import { List } from '@mui/material';
import type { TabPanelProps } from '../types';

export const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
  <div
    role="tabpanel"
    hidden={value !== index}
    id={`strategy-tabpanel-${index}`}
    aria-labelledby={`strategy-tab-${index}`}
    style={{ display: value === index ? 'block' : 'none' }}
  >
    <List sx={{ mt: 2 }}>{children}</List>
  </div>
);

export default TabPanel;
