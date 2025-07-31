import React from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { styled } from '@mui/material/styles';

interface Section {
  id: string;
  label: string;
}

interface CleanNavigationProps {
  sections: Section[];
  activeSection: number;
  onSectionChange: (event: React.SyntheticEvent, index: number) => void;
  hasUnsavedChanges?: boolean;
  onSave: () => void;
}

const NavContainer = styled(Box)(({ theme }) => ({
  backgroundColor: theme.palette.background.paper,
  borderBottom: `1px solid ${theme.palette.divider}`,
  display: 'flex',
  alignItems: 'center',
  padding: '0 24px',
}));

const StyledTabs = styled(Tabs)(({ theme }) => ({
  minHeight: 48,
  '& .MuiTabs-indicator': {
    height: 3,
  },
}));

const StyledTab = styled(Tab)(({ theme }) => ({
  textTransform: 'none',
  minWidth: 0,
  padding: '12px 16px',
  marginRight: theme.spacing(4),
  minHeight: 48,
  fontWeight: theme.typography.fontWeightRegular,
  '&.Mui-selected': {
    fontWeight: theme.typography.fontWeightMedium,
  },
}));

const SaveButton = styled(Button)(({ theme }) => ({
  marginLeft: 'auto',
}));

export default function CleanNavigation({
  sections,
  activeSection,
  onSectionChange,
  hasUnsavedChanges = false,
  onSave,
}: CleanNavigationProps) {
  return (
    <NavContainer>
      <StyledTabs value={activeSection} onChange={onSectionChange}>
        {sections.map((section) => (
          <StyledTab key={section.id} label={section.label} />
        ))}
      </StyledTabs>

      {hasUnsavedChanges && (
        <SaveButton variant="contained" onClick={onSave}>
          Save
        </SaveButton>
      )}
    </NavContainer>
  );
}
