import React, { useEffect, useState } from 'react';

import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DownloadIcon from '@mui/icons-material/Download';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SaveIcon from '@mui/icons-material/Save';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Fab from '@mui/material/Fab';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { alpha, styled } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Zoom from '@mui/material/Zoom';
import { useTheme } from '@mui/material/styles';

interface SidebarSection {
  id: string;
  label: string;
  icon: React.ReactNode;
  completed?: boolean;
  inProgress?: boolean;
}

interface CompactSidebarProps {
  sections: SidebarSection[];
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

const COLLAPSED_WIDTH = 64;
const EXPANDED_WIDTH = 280;

const SidebarContainer = styled(Box)<{ expanded: boolean }>(({ theme, expanded }) => ({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
  minWidth: expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
  transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  borderRight: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
  backgroundColor:
    theme.palette.mode === 'dark'
      ? alpha(theme.palette.background.paper, 0.95)
      : theme.palette.background.paper,
  backdropFilter: 'blur(20px)',
  position: 'relative',
  overflow: 'hidden',
}));

const ToggleButton = styled(IconButton)(({ theme }) => ({
  position: 'absolute',
  top: 12,
  right: 8,
  zIndex: 10,
  width: 32,
  height: 32,
  backgroundColor: alpha(theme.palette.background.default, 0.8),
  backdropFilter: 'blur(10px)',
  '&:hover': {
    backgroundColor: theme.palette.action.hover,
  },
}));

const StatusSection = styled(Box)<{ expanded: boolean }>(({ theme, expanded }) => ({
  padding: expanded ? theme.spacing(2) : theme.spacing(1),
  minHeight: 64,
  display: 'flex',
  flexDirection: 'column',
  alignItems: expanded ? 'flex-start' : 'center',
  justifyContent: 'center',
  position: 'relative',
  borderBottom: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
}));

const ProgressIndicator = styled(Box)<{ progress: number }>(({ theme, progress }) => ({
  width: 40,
  height: 40,
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  '& .progress-bg': {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    background: `conic-gradient(${theme.palette.primary.main} ${progress * 3.6}deg, ${alpha(theme.palette.primary.main, 0.1)} 0deg)`,
  },
  '& .progress-center': {
    width: 32,
    height: 32,
    borderRadius: '50%',
    backgroundColor: theme.palette.background.paper,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 1,
    fontSize: '0.75rem',
    fontWeight: 600,
  },
}));

const NavItem = styled(Box)<{ active?: boolean; completed?: boolean }>(
  ({ theme, active, completed }) => ({
    display: 'flex',
    alignItems: 'center',
    padding: theme.spacing(1.5),
    cursor: 'pointer',
    position: 'relative',
    transition: 'all 0.2s ease',
    color: completed
      ? theme.palette.success.main
      : active
        ? theme.palette.primary.main
        : theme.palette.text.secondary,
    '&:hover': {
      backgroundColor: alpha(theme.palette.action.hover, 0.8),
      '& .nav-icon': {
        transform: 'scale(1.1)',
      },
    },
    '&::before': {
      content: '""',
      position: 'absolute',
      left: 0,
      top: '50%',
      transform: 'translateY(-50%)',
      width: 4,
      height: active ? 24 : 0,
      backgroundColor: theme.palette.primary.main,
      borderRadius: '0 2px 2px 0',
      transition: 'height 0.2s ease',
    },
  }),
);

const NavIcon = styled(Box)(({ theme }) => ({
  width: 32,
  height: 32,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'transform 0.2s ease',
  '& .MuiSvgIcon-root': {
    fontSize: 20,
  },
}));

const NavLabel = styled(Typography)(({ theme }) => ({
  marginLeft: theme.spacing(2),
  fontSize: '0.875rem',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}));

const CompletionDot = styled(Box)(({ theme }) => ({
  position: 'absolute',
  top: 10,
  right: 10,
  width: 8,
  height: 8,
  borderRadius: '50%',
  backgroundColor: theme.palette.success.main,
  boxShadow: `0 0 0 2px ${theme.palette.background.paper}`,
}));

const FloatingActionButton = styled(Fab)<{ show: boolean }>(({ theme, show }) => ({
  position: 'absolute',
  bottom: 16,
  left: '50%',
  transform: `translateX(-50%) ${show ? 'translateY(0)' : 'translateY(100px)'}`,
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  backgroundColor: theme.palette.primary.main,
  color: 'white',
  width: 40,
  height: 40,
  '&:hover': {
    backgroundColor: theme.palette.primary.dark,
  },
}));

const MiniProgress = styled(LinearProgress)(({ theme }) => ({
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  height: 3,
  '& .MuiLinearProgress-bar': {
    background: 'linear-gradient(90deg, #2196F3 0%, #21CBF3 100%)',
  },
}));

const PulsingDot = styled(Box)(({ theme }) => ({
  width: 10,
  height: 10,
  borderRadius: '50%',
  backgroundColor: theme.palette.warning.main,
  position: 'absolute',
  top: 8,
  right: 8,
  animation: 'pulse 2s infinite',
  '@keyframes pulse': {
    '0%': { opacity: 1, transform: 'scale(1)' },
    '50%': { opacity: 0.6, transform: 'scale(1.2)' },
    '100%': { opacity: 1, transform: 'scale(1)' },
  },
}));

export default function CompactSidebar({
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
}: CompactSidebarProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const completedSections = sections.filter((s) => s.completed).length;
  const progress = (completedSections / sections.length) * 100;

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  // Auto-collapse on section change
  useEffect(() => {
    if (expanded) {
      const timer = setTimeout(() => setExpanded(false), 500);
      return () => clearTimeout(timer);
    }
  }, [activeSection]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        const num = parseInt(e.key);
        if (num >= 1 && num <= sections.length) {
          e.preventDefault();
          onSectionChange(num - 1);
        } else if (e.key === 's') {
          e.preventDefault();
          onSave();
        } else if (e.key === 'b') {
          e.preventDefault();
          setExpanded(!expanded);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [sections.length, onSectionChange, onSave, expanded]);

  return (
    <SidebarContainer expanded={expanded}>
      <ToggleButton
        size="small"
        onClick={() => setExpanded(!expanded)}
        sx={{ opacity: expanded ? 1 : 0.6 }}
      >
        {expanded ? <ChevronLeftIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
      </ToggleButton>

      <StatusSection expanded={expanded}>
        {expanded ? (
          <>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1, pr: 4 }} noWrap>
              {configName}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {autoSaving ? (
                <>
                  <CircularProgress size={14} thickness={4} />
                  <Typography variant="caption" color="text.secondary">
                    Saving...
                  </Typography>
                </>
              ) : lastSaved ? (
                <>
                  <CheckCircleIcon sx={{ fontSize: 14, color: 'success.main' }} />
                  <Typography variant="caption" color="text.secondary">
                    Saved
                  </Typography>
                </>
              ) : null}
            </Box>
          </>
        ) : (
          <Tooltip
            title={`${configName} - ${completedSections}/${sections.length} completed`}
            placement="right"
          >
            <ProgressIndicator progress={progress}>
              <div className="progress-bg" />
              <div className="progress-center">{Math.round(progress)}%</div>
            </ProgressIndicator>
          </Tooltip>
        )}
        {hasUnsavedChanges && !expanded && <PulsingDot />}
      </StatusSection>

      <Box sx={{ flexGrow: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
        {sections.map((section, index) => (
          <Tooltip
            key={section.id}
            title={!expanded ? `${section.label} (⌘${index + 1})` : ''}
            placement="right"
            TransitionComponent={Zoom}
          >
            <NavItem
              active={activeSection === index}
              completed={section.completed}
              onClick={() => onSectionChange(index)}
            >
              <NavIcon className="nav-icon">
                {section.inProgress ? <CircularProgress size={20} thickness={4} /> : section.icon}
              </NavIcon>
              {expanded && <NavLabel>{section.label}</NavLabel>}
              {section.completed && !expanded && <CompletionDot />}
            </NavItem>
          </Tooltip>
        ))}
      </Box>

      {expanded ? (
        <Box sx={{ p: 2, borderTop: `1px solid ${alpha(theme.palette.divider, 0.08)}` }}>
          <Tooltip title="Save configuration (⌘S)">
            <IconButton
              onClick={onSave}
              disabled={!hasUnsavedChanges || autoSaving}
              color="primary"
              sx={{ mb: 1 }}
            >
              <SaveIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="More actions">
            <IconButton onClick={handleMenuOpen}>
              <MoreVertIcon />
            </IconButton>
          </Tooltip>
        </Box>
      ) : (
        <>
          <Divider />
          <Box sx={{ position: 'relative', height: 80 }}>
            <FloatingActionButton
              size="small"
              color="primary"
              onClick={hasUnsavedChanges ? onSave : handleMenuOpen}
              show={true}
              disabled={autoSaving}
            >
              {autoSaving ? (
                <CircularProgress size={24} color="inherit" />
              ) : hasUnsavedChanges ? (
                <SaveIcon fontSize="small" />
              ) : (
                <MoreVertIcon fontSize="small" />
              )}
            </FloatingActionButton>
          </Box>
        </>
      )}

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        transformOrigin={{ horizontal: 'left', vertical: 'bottom' }}
        anchorOrigin={{ horizontal: 'left', vertical: 'top' }}
      >
        {!hasUnsavedChanges && (
          <MenuItem
            onClick={() => {
              onSave();
              handleMenuClose();
            }}
          >
            <SaveIcon sx={{ mr: 1, fontSize: 20 }} /> Save
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            onLoad();
            handleMenuClose();
          }}
        >
          <FolderOpenIcon sx={{ mr: 1, fontSize: 20 }} /> Load
        </MenuItem>
        {onDownload && (
          <MenuItem
            onClick={() => {
              onDownload();
              handleMenuClose();
            }}
          >
            <DownloadIcon sx={{ mr: 1, fontSize: 20 }} /> Export
          </MenuItem>
        )}
        <Divider />
        <MenuItem
          onClick={() => {
            onReset();
            handleMenuClose();
          }}
          sx={{ color: 'error.main' }}
        >
          <RestartAltIcon sx={{ mr: 1, fontSize: 20 }} /> Reset
        </MenuItem>
      </Menu>

      <MiniProgress variant="determinate" value={progress} />
    </SidebarContainer>
  );
}
