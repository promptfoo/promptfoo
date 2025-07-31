import React, { useState } from 'react';

import MoreVertIcon from '@mui/icons-material/MoreVert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { alpha, styled } from '@mui/material/styles';
import Typography from '@mui/material/Typography';

interface SettingsSection {
  id: string;
  label: string;
  icon: React.ReactNode;
  count?: number;
}

interface SettingsSidebarProps {
  sections: SettingsSection[];
  activeSection: number;
  onSectionChange: (index: number) => void;
  configName?: string;
  hasUnsavedChanges?: boolean;
  onSave: () => void;
  onExport: () => void;
  onLoad?: () => void;
  onReset?: () => void;
}

const SidebarContainer = styled(Box)(({ theme }) => ({
  width: 240,
  height: '100%',
  backgroundColor: theme.palette.background.paper,
  borderRight: `1px solid ${theme.palette.divider}`,
  display: 'flex',
  flexDirection: 'column',
}));

const Header = styled(Box)(({ theme }) => ({
  padding: theme.spacing(3, 2, 2),
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
}));

const ConfigName = styled(Typography)(({ theme }) => ({
  fontSize: '0.875rem',
  fontWeight: 500,
  color: theme.palette.text.primary,
  marginBottom: theme.spacing(0.5),
}));

const SaveStatus = styled(Typography)(({ theme }) => ({
  fontSize: '0.75rem',
  color: theme.palette.text.secondary,
}));

const NavSection = styled(Box)(({ theme }) => ({
  flex: 1,
  padding: theme.spacing(0, 1),
  overflowY: 'auto',
}));

const NavItem = styled(Box)<{ active?: boolean }>(({ theme, active }) => ({
  display: 'flex',
  alignItems: 'center',
  padding: theme.spacing(1.25, 1.5),
  marginBottom: theme.spacing(0.25),
  borderRadius: theme.shape.borderRadius,
  cursor: 'pointer',
  transition: 'background-color 0.2s',
  backgroundColor: active ? alpha(theme.palette.text.primary, 0.08) : 'transparent',
  '&:hover': {
    backgroundColor: active
      ? alpha(theme.palette.text.primary, 0.08)
      : alpha(theme.palette.text.primary, 0.04),
  },
}));

const NavIcon = styled(Box)(({ theme }) => ({
  marginRight: theme.spacing(1.5),
  display: 'flex',
  alignItems: 'center',
  color: theme.palette.text.secondary,
  '& svg': {
    fontSize: 20,
  },
}));

const NavLabel = styled(Typography)<{ active?: boolean }>(({ theme, active }) => ({
  fontSize: '0.875rem',
  fontWeight: active ? 500 : 400,
  color: active ? theme.palette.text.primary : theme.palette.text.secondary,
  flex: 1,
}));

const Count = styled(Typography)(({ theme }) => ({
  fontSize: '0.75rem',
  color: theme.palette.text.secondary,
  backgroundColor: alpha(theme.palette.text.secondary, 0.1),
  padding: theme.spacing(0.25, 0.75),
  borderRadius: 12,
  minWidth: 20,
  textAlign: 'center',
}));

const Actions = styled(Box)(({ theme }) => ({
  padding: theme.spacing(2),
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(1),
}));

const ActionButton = styled(Button)(({ theme }) => ({
  justifyContent: 'flex-start',
  textTransform: 'none',
  fontWeight: 400,
  color: theme.palette.text.secondary,
  padding: theme.spacing(0.75, 1.5),
  '&:hover': {
    backgroundColor: alpha(theme.palette.text.primary, 0.04),
  },
}));

export default function SettingsSidebar({
  sections,
  activeSection,
  onSectionChange,
  configName = 'Configuration',
  hasUnsavedChanges = false,
  onSave,
  onExport,
  onLoad,
  onReset,
}: SettingsSidebarProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  return (
    <SidebarContainer>
      <Header>
        <Box>
          <ConfigName>{configName}</ConfigName>
          <SaveStatus>{hasUnsavedChanges ? 'Unsaved changes' : 'All changes saved'}</SaveStatus>
        </Box>
        {(onLoad || onReset) && (
          <IconButton
            size="small"
            onClick={handleMenuOpen}
            sx={{
              marginTop: -0.5,
              marginRight: -0.5,
              color: 'text.secondary',
            }}
          >
            <MoreVertIcon fontSize="small" />
          </IconButton>
        )}
      </Header>

      <NavSection>
        {sections.map((section, index) => (
          <NavItem
            key={section.id}
            active={activeSection === index}
            onClick={() => onSectionChange(index)}
          >
            <NavIcon>{section.icon}</NavIcon>
            <NavLabel active={activeSection === index}>{section.label}</NavLabel>
            {section.count !== undefined && <Count>{section.count}</Count>}
          </NavItem>
        ))}
      </NavSection>

      <Divider />

      <Actions>
        {hasUnsavedChanges && (
          <ActionButton
            variant="contained"
            onClick={onSave}
            sx={{
              mb: 1,
              backgroundColor: 'text.primary',
              color: 'background.paper',
              '&:hover': {
                backgroundColor: alpha('text.primary', 0.9),
              },
            }}
          >
            Save changes
          </ActionButton>
        )}
        <ActionButton onClick={onExport}>Export configuration</ActionButton>
      </Actions>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        {onLoad && (
          <MenuItem
            onClick={() => {
              onLoad();
              handleMenuClose();
            }}
          >
            Load configuration
          </MenuItem>
        )}
        {onReset && (
          <MenuItem
            onClick={() => {
              onReset();
              handleMenuClose();
            }}
            sx={{ color: 'error.main' }}
          >
            Reset to defaults
          </MenuItem>
        )}
      </Menu>
    </SidebarContainer>
  );
}
