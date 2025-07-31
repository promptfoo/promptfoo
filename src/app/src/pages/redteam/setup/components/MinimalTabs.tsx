import React from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { alpha, styled } from '@mui/material/styles';

interface TabSection {
  id: string;
  label: string;
  count?: number;
}

interface MinimalTabsProps {
  sections: TabSection[];
  activeSection: number;
  onSectionChange: (event: React.SyntheticEvent, index: number) => void;
  hasUnsavedChanges?: boolean;
  onSave: () => void;
}

const TabsContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  padding: theme.spacing(0, 2),
  borderBottom: `1px solid ${theme.palette.divider}`,
  backgroundColor: theme.palette.background.paper,
  gap: theme.spacing(2),
}));

const StyledTabs = styled(Tabs)(({ theme }) => ({
  minHeight: 48,
  '& .MuiTabs-indicator': {
    height: 2,
  },
  '& .MuiTab-root': {
    minHeight: 48,
    textTransform: 'none',
    fontSize: '0.875rem',
    fontWeight: 400,
    color: theme.palette.text.secondary,
    padding: theme.spacing(1, 2),
    '&.Mui-selected': {
      color: theme.palette.text.primary,
      fontWeight: 500,
    },
  },
}));

const TabLabel = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
});

const CountChip = styled(Chip)(({ theme }) => ({
  height: 20,
  fontSize: '0.75rem',
  backgroundColor: alpha(theme.palette.action.selected, 0.6),
  '& .MuiChip-label': {
    padding: '0 6px',
  },
}));

const SaveButton = styled(Button)(({ theme }) => ({
  marginLeft: 'auto',
  textTransform: 'none',
  fontWeight: 500,
  minWidth: 80,
  height: 32,
}));

export default function MinimalTabs({
  sections,
  activeSection,
  onSectionChange,
  hasUnsavedChanges = false,
  onSave,
}: MinimalTabsProps) {
  return (
    <TabsContainer>
      <StyledTabs
        value={activeSection}
        onChange={onSectionChange}
        variant="scrollable"
        scrollButtons={false}
      >
        {sections.map((section) => (
          <Tab
            key={section.id}
            label={
              <TabLabel>
                {section.label}
                {section.count !== undefined && section.count > 0 && (
                  <CountChip label={section.count} size="small" />
                )}
              </TabLabel>
            }
          />
        ))}
      </StyledTabs>

      {hasUnsavedChanges && (
        <SaveButton variant="contained" size="small" onClick={onSave} disableElevation>
          Save
        </SaveButton>
      )}
    </TabsContainer>
  );
}
