import React from 'react';
import AssessmentIcon from '@mui/icons-material/Assessment';
import DashboardIcon from '@mui/icons-material/Dashboard';
import HelpIcon from '@mui/icons-material/Help';
import MenuIcon from '@mui/icons-material/Menu';
import SettingsIcon from '@mui/icons-material/Settings';
import { Box, Button, Drawer } from '@mui/material';

interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export default function Sidebar({ sidebarOpen, setSidebarOpen }: SidebarProps) {
  return (
    <Drawer
      variant="permanent"
      sx={{
        width: 60,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: 60,
          boxSizing: 'border-box',
          overflowX: 'hidden',
          transition: 'width 0.3s ease-in-out',
          top: '48px',
          height: 'calc(100% - 48px)',
          zIndex: 1,
          ...(sidebarOpen && {
            width: 240,
          }),
        },
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ display: 'flex', p: 1 }}>
          <Button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            sx={{ justifyContent: 'flex-start' }}
          >
            <MenuIcon />
          </Button>
        </Box>
        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', mt: 2 }}>
          <Button
            startIcon={<DashboardIcon />}
            sx={{
              justifyContent: sidebarOpen ? 'flex-start' : 'center',
              px: sidebarOpen ? 2 : 1,
              mb: 1,
            }}
          >
            {sidebarOpen && 'Dashboard'}
          </Button>
          <Button
            startIcon={<AssessmentIcon />}
            sx={{
              justifyContent: sidebarOpen ? 'flex-start' : 'center',
              px: sidebarOpen ? 2 : 1,
              mb: 1,
            }}
          >
            {sidebarOpen && 'Reports'}
          </Button>
          <Button
            startIcon={<SettingsIcon />}
            sx={{
              justifyContent: sidebarOpen ? 'flex-start' : 'center',
              px: sidebarOpen ? 2 : 1,
              mb: 1,
            }}
          >
            {sidebarOpen && 'Settings'}
          </Button>
        </Box>
        <Box sx={{ mb: 2 }}>
          <Button
            startIcon={<HelpIcon />}
            sx={{
              justifyContent: sidebarOpen ? 'flex-start' : 'center',
              px: sidebarOpen ? 2 : 1,
            }}
          >
            {sidebarOpen && 'Help'}
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
}
