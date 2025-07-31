import React, { useState } from 'react';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { alpha, styled } from '@mui/material/styles';
import Typography from '@mui/material/Typography';

interface NavSection {
  id: string;
  label: string;
  shortLabel?: string;
  count?: number;
}

interface UltraCompactNavProps {
  sections: NavSection[];
  activeSection: number;
  onSectionChange: (index: number) => void;
  hasUnsavedChanges?: boolean;
  onSave: () => void;
}

// Option 1: Dropdown Navigation (24px height)
const DropdownContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  padding: theme.spacing(0.5, 2),
  backgroundColor: theme.palette.background.paper,
  borderBottom: `1px solid ${theme.palette.divider}`,
  gap: theme.spacing(2),
  minHeight: 40,
}));

const SectionButton = styled(ButtonBase)(({ theme }) => ({
  padding: theme.spacing(0.5, 1),
  borderRadius: theme.shape.borderRadius,
  fontSize: '0.875rem',
  fontWeight: 500,
  color: theme.palette.text.primary,
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(0.5),
  '&:hover': {
    backgroundColor: alpha(theme.palette.action.hover, 0.8),
  },
}));

// Option 2: Icon-only Navigation (40px width)
const IconNavContainer = styled(Box)(({ theme }) => ({
  width: 40,
  backgroundColor: theme.palette.background.paper,
  borderRight: `1px solid ${theme.palette.divider}`,
  display: 'flex',
  flexDirection: 'column',
  paddingTop: theme.spacing(1),
}));

const IconButton = styled(ButtonBase)<{ active?: boolean }>(({ theme, active }) => ({
  width: 40,
  height: 40,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative',
  color: active ? theme.palette.primary.main : theme.palette.text.secondary,
  '&:hover': {
    backgroundColor: alpha(theme.palette.action.hover, 0.8),
  },
  '&::before': {
    content: '""',
    position: 'absolute',
    left: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    width: 3,
    height: active ? 20 : 0,
    backgroundColor: theme.palette.primary.main,
    transition: 'height 0.2s ease',
  },
}));

const IconLabel = styled(Typography)(({ theme }) => ({
  fontSize: '0.625rem',
  fontWeight: 600,
  lineHeight: 1,
}));

const Badge = styled(Box)(({ theme }) => ({
  position: 'absolute',
  top: 6,
  right: 6,
  minWidth: 16,
  height: 16,
  borderRadius: 8,
  backgroundColor: theme.palette.primary.main,
  color: 'white',
  fontSize: '0.625rem',
  fontWeight: 600,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 4px',
}));

// Option 3: Breadcrumb style (32px height)
const BreadcrumbNav = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  padding: theme.spacing(0.5, 2),
  backgroundColor: theme.palette.background.default,
  borderBottom: `1px solid ${theme.palette.divider}`,
  gap: theme.spacing(1),
  minHeight: 32,
  fontSize: '0.75rem',
}));

const BreadcrumbItem = styled(ButtonBase)<{ active?: boolean }>(({ theme, active }) => ({
  padding: theme.spacing(0.25, 1),
  borderRadius: theme.shape.borderRadius,
  fontSize: '0.75rem',
  fontWeight: active ? 600 : 400,
  color: active ? theme.palette.primary.main : theme.palette.text.secondary,
  '&:hover': {
    backgroundColor: alpha(theme.palette.action.hover, 0.8),
  },
}));

const Separator = styled(Box)(({ theme }) => ({
  color: theme.palette.text.disabled,
  fontSize: '0.75rem',
}));

const CompactSaveButton = styled(Button)(({ theme }) => ({
  marginLeft: 'auto',
  padding: theme.spacing(0.25, 1),
  fontSize: '0.75rem',
  textTransform: 'none',
  minWidth: 50,
  height: 24,
}));

export function DropdownNav({
  sections,
  activeSection,
  onSectionChange,
  hasUnsavedChanges = false,
  onSave,
}: UltraCompactNavProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const currentSection = sections[activeSection];

  return (
    <DropdownContainer>
      <SectionButton onClick={(e) => setAnchorEl(e.currentTarget)}>
        {currentSection?.label}
        {currentSection?.count !== undefined && currentSection.count > 0 && (
          <Typography variant="caption" sx={{ ml: 0.5 }}>
            ({currentSection.count})
          </Typography>
        )}
        <ExpandMoreIcon fontSize="small" />
      </SectionButton>

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        {sections.map((section, index) => (
          <MenuItem
            key={section.id}
            selected={activeSection === index}
            onClick={() => {
              onSectionChange(index);
              setAnchorEl(null);
            }}
          >
            {section.label}
            {section.count !== undefined && section.count > 0 && (
              <Typography variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
                ({section.count})
              </Typography>
            )}
          </MenuItem>
        ))}
      </Menu>

      {hasUnsavedChanges && (
        <CompactSaveButton variant="contained" size="small" onClick={onSave} disableElevation>
          Save
        </CompactSaveButton>
      )}
    </DropdownContainer>
  );
}

export function IconOnlyNav({
  sections,
  activeSection,
  onSectionChange,
}: Omit<UltraCompactNavProps, 'onSave' | 'hasUnsavedChanges'>) {
  return (
    <IconNavContainer>
      {sections.map((section, index) => (
        <IconButton
          key={section.id}
          active={activeSection === index}
          onClick={() => onSectionChange(index)}
        >
          <Box sx={{ position: 'relative' }}>
            <IconLabel>{section.shortLabel || section.label.charAt(0)}</IconLabel>
            {section.count !== undefined && section.count > 0 && <Badge>{section.count}</Badge>}
          </Box>
        </IconButton>
      ))}
    </IconNavContainer>
  );
}

export function BreadcrumbNavigation({
  sections,
  activeSection,
  onSectionChange,
  hasUnsavedChanges = false,
  onSave,
}: UltraCompactNavProps) {
  return (
    <BreadcrumbNav>
      {sections.map((section, index) => (
        <React.Fragment key={section.id}>
          {index > 0 && <Separator>/</Separator>}
          <BreadcrumbItem active={activeSection === index} onClick={() => onSectionChange(index)}>
            {section.shortLabel || section.label}
            {section.count !== undefined && section.count > 0 && ` (${section.count})`}
          </BreadcrumbItem>
        </React.Fragment>
      ))}

      {hasUnsavedChanges && (
        <CompactSaveButton
          variant="text"
          size="small"
          onClick={onSave}
          sx={{ color: 'primary.main' }}
        >
          Save
        </CompactSaveButton>
      )}
    </BreadcrumbNav>
  );
}
