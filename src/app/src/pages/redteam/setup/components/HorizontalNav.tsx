import React, { useState } from 'react';

import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DownloadIcon from '@mui/icons-material/Download';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SaveIcon from '@mui/icons-material/Save';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { alpha, styled } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

interface NavSection {
  id: string;
  label: string;
  icon: React.ReactNode;
  completed?: boolean;
  inProgress?: boolean;
}

interface HorizontalNavProps {
  sections: NavSection[];
  activeSection: number;
  onSectionChange: (index: number) => void;
  configName?: string;
  hasUnsavedChanges?: boolean;
  lastSaved?: string | null;
  onSave: () => void;
  onLoad: () => void;
  onReset: () => void;
  onDownload?: () => void;
  autoSaving?: boolean;
}

const NavContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  padding: theme.spacing(1, 2),
  backgroundColor:
    theme.palette.mode === 'dark'
      ? alpha(theme.palette.background.paper, 0.95)
      : theme.palette.background.paper,
  borderBottom: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
  backdropFilter: 'blur(20px)',
  gap: theme.spacing(2),
  minHeight: 56,
  position: 'sticky',
  top: 0,
  zIndex: 100,
}));

const StepIndicator = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
  flex: 1,
  overflowX: 'auto',
  '&::-webkit-scrollbar': {
    height: 4,
  },
  '&::-webkit-scrollbar-track': {
    backgroundColor: alpha(theme.palette.action.hover, 0.1),
  },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor: alpha(theme.palette.action.hover, 0.3),
    borderRadius: 2,
  },
}));

const StepButton = styled(Button)<{ active?: boolean; completed?: boolean }>(
  ({ theme, active, completed }) => ({
    minWidth: 'auto',
    padding: theme.spacing(0.5, 1.5),
    borderRadius: 20,
    fontSize: '0.8125rem',
    fontWeight: 500,
    textTransform: 'none',
    color: completed
      ? theme.palette.success.main
      : active
        ? theme.palette.primary.contrastText
        : theme.palette.text.secondary,
    backgroundColor: active
      ? theme.palette.primary.main
      : completed
        ? alpha(theme.palette.success.main, 0.1)
        : 'transparent',
    border: `1px solid ${
      active
        ? theme.palette.primary.main
        : completed
          ? alpha(theme.palette.success.main, 0.3)
          : alpha(theme.palette.divider, 0.2)
    }`,
    transition: 'all 0.2s ease',
    '&:hover': {
      backgroundColor: active ? theme.palette.primary.dark : alpha(theme.palette.action.hover, 0.8),
      transform: 'translateY(-1px)',
      boxShadow: theme.shadows[2],
    },
    '& .MuiSvgIcon-root': {
      fontSize: 16,
      marginRight: theme.spacing(0.5),
    },
  }),
);

const StepConnector = styled(Box)(({ theme }) => ({
  width: 24,
  height: 1,
  backgroundColor: alpha(theme.palette.divider, 0.3),
  position: 'relative',
  '&::after': {
    content: '""',
    position: 'absolute',
    right: -5,
    top: '50%',
    transform: 'translateY(-50%)',
    width: 0,
    height: 0,
    borderStyle: 'solid',
    borderWidth: '3px 0 3px 5px',
    borderColor: `transparent transparent transparent ${alpha(theme.palette.divider, 0.3)}`,
  },
}));

const ConfigInfo = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
  marginRight: theme.spacing(2),
  paddingRight: theme.spacing(2),
  borderRight: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
}));

const SaveIndicator = styled(Chip)(({ theme }) => ({
  height: 24,
  fontSize: '0.75rem',
  '& .MuiChip-icon': {
    fontSize: 14,
  },
}));

const ActionButtons = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
}));

const ProgressBar = styled(LinearProgress)(({ theme }) => ({
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  height: 2,
  '& .MuiLinearProgress-bar': {
    background: 'linear-gradient(90deg, #2196F3 0%, #21CBF3 100%)',
  },
}));

const CompactButton = styled(IconButton)(({ theme }) => ({
  padding: theme.spacing(0.75),
  '&:hover': {
    backgroundColor: alpha(theme.palette.action.hover, 0.8),
  },
}));

export default function HorizontalNav({
  sections,
  activeSection,
  onSectionChange,
  configName = 'New Configuration',
  hasUnsavedChanges = false,
  lastSaved,
  onSave,
  onLoad,
  onReset,
  onDownload,
  autoSaving = false,
}: HorizontalNavProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const completedSections = sections.filter((s) => s.completed).length;
  const progress = (completedSections / sections.length) * 100;

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  return (
    <NavContainer>
      <ConfigInfo>
        <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 150 }}>
          {configName}
        </Typography>
        {autoSaving ? (
          <SaveIndicator
            size="small"
            icon={<CircularProgress size={14} thickness={4} />}
            label="Saving"
            color="primary"
          />
        ) : hasUnsavedChanges ? (
          <SaveIndicator size="small" label="Unsaved" color="warning" variant="outlined" />
        ) : lastSaved ? (
          <SaveIndicator
            size="small"
            icon={<CheckCircleIcon />}
            label="Saved"
            color="success"
            variant="outlined"
          />
        ) : null}
      </ConfigInfo>

      <StepIndicator>
        {sections.map((section, index) => (
          <React.Fragment key={section.id}>
            {index > 0 && <StepConnector />}
            <Tooltip title={`${section.label} (⌘${index + 1})`}>
              <StepButton
                active={activeSection === index}
                completed={section.completed}
                onClick={() => onSectionChange(index)}
                startIcon={
                  section.inProgress ? (
                    <CircularProgress size={16} thickness={4} />
                  ) : section.completed ? (
                    <CheckCircleIcon />
                  ) : (
                    section.icon
                  )
                }
              >
                {section.label}
              </StepButton>
            </Tooltip>
          </React.Fragment>
        ))}
      </StepIndicator>

      <ActionButtons>
        {hasUnsavedChanges && (
          <Tooltip title="Save (⌘S)">
            <CompactButton color="primary" onClick={onSave} disabled={autoSaving}>
              <SaveIcon fontSize="small" />
            </CompactButton>
          </Tooltip>
        )}

        <Tooltip title="More actions">
          <CompactButton onClick={handleMenuOpen}>
            <MoreHorizIcon fontSize="small" />
          </CompactButton>
        </Tooltip>
      </ActionButtons>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        {!hasUnsavedChanges && (
          <MenuItem
            onClick={() => {
              onSave();
              handleMenuClose();
            }}
          >
            <SaveIcon sx={{ mr: 1, fontSize: 18 }} /> Save
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            onLoad();
            handleMenuClose();
          }}
        >
          <FolderOpenIcon sx={{ mr: 1, fontSize: 18 }} /> Load
        </MenuItem>
        {onDownload && (
          <MenuItem
            onClick={() => {
              onDownload();
              handleMenuClose();
            }}
          >
            <DownloadIcon sx={{ mr: 1, fontSize: 18 }} /> Export
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            onReset();
            handleMenuClose();
          }}
          sx={{ color: 'error.main' }}
        >
          <RestartAltIcon sx={{ mr: 1, fontSize: 18 }} /> Reset
        </MenuItem>
      </Menu>

      <ProgressBar variant="determinate" value={progress} />
    </NavContainer>
  );
}
