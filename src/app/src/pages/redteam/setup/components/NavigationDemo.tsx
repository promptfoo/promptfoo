import React, { useState } from 'react';
import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

import ModernSidebar from './ModernSidebar';
import CompactSidebar from './CompactSidebar';
import HorizontalNav from './HorizontalNav';

import AppIcon from '@mui/icons-material/Apps';
import PluginIcon from '@mui/icons-material/Extension';
import TargetIcon from '@mui/icons-material/GpsFixed';
import StrategyIcon from '@mui/icons-material/Psychology';
import ReviewIcon from '@mui/icons-material/RateReview';

type NavType = 'modern' | 'compact' | 'horizontal';

const DemoContainer = styled(Box)(({ theme }) => ({
  padding: theme.spacing(3),
  backgroundColor: theme.palette.background.default,
  minHeight: '100vh',
}));

const ControlPanel = styled(Box)(({ theme }) => ({
  marginBottom: theme.spacing(3),
  padding: theme.spacing(2),
  backgroundColor: theme.palette.background.paper,
  borderRadius: theme.shape.borderRadius,
  boxShadow: theme.shadows[1],
}));

const PreviewContainer = styled(Box)(({ theme }) => ({
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: theme.shape.borderRadius,
  overflow: 'hidden',
  backgroundColor: theme.palette.background.paper,
  boxShadow: theme.shadows[2],
}));

const ContentArea = styled(Box)(({ theme }) => ({
  padding: theme.spacing(3),
  minHeight: 400,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: theme.palette.text.secondary,
}));

const ComparisonTable = styled(Box)(({ theme }) => ({
  marginTop: theme.spacing(4),
  padding: theme.spacing(3),
  backgroundColor: theme.palette.background.paper,
  borderRadius: theme.shape.borderRadius,
  '& table': {
    width: '100%',
    borderCollapse: 'collapse',
    '& th, & td': {
      padding: theme.spacing(1.5),
      textAlign: 'left',
      borderBottom: `1px solid ${theme.palette.divider}`,
    },
    '& th': {
      fontWeight: 600,
      color: theme.palette.text.primary,
    },
  },
}));

export default function NavigationDemo() {
  const [navType, setNavType] = useState<NavType>('compact');
  const [activeSection, setActiveSection] = useState(0);

  // Demo data
  const sections = [
    {
      id: 'targets',
      label: 'Targets',
      icon: <TargetIcon />,
      completed: true,
    },
    {
      id: 'purpose',
      label: 'Usage Details',
      icon: <AppIcon />,
      completed: true,
    },
    {
      id: 'plugins',
      label: 'Plugins (3)',
      icon: <PluginIcon />,
      completed: false,
      inProgress: true,
    },
    {
      id: 'strategies',
      label: 'Strategies (5)',
      icon: <StrategyIcon />,
      completed: false,
    },
    {
      id: 'review',
      label: 'Review',
      icon: <ReviewIcon />,
      completed: false,
    },
  ];

  const commonProps = {
    sections,
    activeSection,
    onSectionChange: setActiveSection,
    configName: 'My Red Team Config',
    hasUnsavedChanges: true,
    lastSaved: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    onSave: () => console.log('Save clicked'),
    onLoad: () => console.log('Load clicked'),
    onReset: () => console.log('Reset clicked'),
    onDownload: () => console.log('Download clicked'),
    autoSaving: false,
  };

  return (
    <DemoContainer>
      <Typography variant="h4" gutterBottom>
        Navigation Options Comparison
      </Typography>

      <ControlPanel>
        <FormControl component="fieldset">
          <Typography variant="subtitle2" gutterBottom>
            Select Navigation Style:
          </Typography>
          <RadioGroup row value={navType} onChange={(e) => setNavType(e.target.value as NavType)}>
            <FormControlLabel value="modern" control={<Radio />} label="Modern Sidebar (300px)" />
            <FormControlLabel
              value="compact"
              control={<Radio />}
              label="Compact Sidebar (64px collapsed)"
            />
            <FormControlLabel
              value="horizontal"
              control={<Radio />}
              label="Horizontal Navigation (56px height)"
            />
          </RadioGroup>
        </FormControl>
      </ControlPanel>

      <PreviewContainer>
        {navType === 'modern' && (
          <Box sx={{ display: 'flex', height: 600 }}>
            <ModernSidebar {...commonProps} />
            <ContentArea sx={{ flex: 1 }}>
              <Typography variant="h6">Content Area</Typography>
            </ContentArea>
          </Box>
        )}

        {navType === 'compact' && (
          <Box sx={{ display: 'flex', height: 600 }}>
            <CompactSidebar {...commonProps} />
            <ContentArea sx={{ flex: 1 }}>
              <Typography variant="h6">Content Area</Typography>
            </ContentArea>
          </Box>
        )}

        {navType === 'horizontal' && (
          <Box>
            <HorizontalNav {...commonProps} />
            <ContentArea>
              <Typography variant="h6">Content Area</Typography>
            </ContentArea>
          </Box>
        )}
      </PreviewContainer>

      <ComparisonTable>
        <Typography variant="h6" gutterBottom>
          Space Usage Comparison
        </Typography>
        <table>
          <thead>
            <tr>
              <th>Navigation Type</th>
              <th>Space Used</th>
              <th>Best For</th>
              <th>Key Features</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Modern Sidebar</td>
              <td>300px width</td>
              <td>Desktop with ample screen space</td>
              <td>
                • Full labels always visible
                <br />• Detailed status information
                <br />• Progress visualization
                <br />• Keyboard shortcuts displayed
              </td>
            </tr>
            <tr>
              <td>Compact Sidebar</td>
              <td>64px collapsed / 280px expanded</td>
              <td>Flexible layouts, medium screens</td>
              <td>
                • Collapsible design
                <br />• Icon-only mode
                <br />• Hover tooltips
                <br />• Floating action button
                <br />• Auto-collapse on navigation
              </td>
            </tr>
            <tr>
              <td>Horizontal Navigation</td>
              <td>56px height</td>
              <td>Maximum content area, small screens</td>
              <td>
                • Minimal vertical space
                <br />• Breadcrumb-style steps
                <br />• Inline status chips
                <br />• Responsive scrolling
                <br />• Perfect for mobile/tablet
              </td>
            </tr>
          </tbody>
        </table>
      </ComparisonTable>

      <Box sx={{ mt: 4, p: 3, backgroundColor: 'background.paper', borderRadius: 1 }}>
        <Typography variant="h6" gutterBottom>
          Implementation Notes
        </Typography>
        <Typography variant="body2" paragraph>
          To use any of these navigation components in your page:
        </Typography>
        <pre
          style={{
            backgroundColor: '#f5f5f5',
            padding: '16px',
            borderRadius: '4px',
            overflow: 'auto',
          }}
        >
          {`// For Compact Sidebar (recommended for space-saving)
import CompactSidebar from './components/CompactSidebar';

// For Horizontal Navigation (maximum space-saving)  
import HorizontalNav from './components/HorizontalNav';

// For Modern Sidebar (full-featured)
import ModernSidebar from './components/ModernSidebar';`}
        </pre>
      </Box>
    </DemoContainer>
  );
}
