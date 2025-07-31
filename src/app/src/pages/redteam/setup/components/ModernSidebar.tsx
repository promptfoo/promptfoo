import React, { useEffect, useState } from 'react';

import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DownloadIcon from '@mui/icons-material/Download';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SaveIcon from '@mui/icons-material/Save';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import { alpha, styled } from '@mui/material/styles';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

interface SidebarSection {
  id: string;
  label: string;
  icon: React.ReactNode;
  completed?: boolean;
  inProgress?: boolean;
}

interface ModernSidebarProps {
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

const SidebarContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: 300,
  minWidth: 300,
  borderRight: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
  backgroundColor:
    theme.palette.mode === 'dark'
      ? alpha(theme.palette.background.paper, 0.95)
      : theme.palette.background.paper,
  backdropFilter: 'blur(20px)',
  position: 'relative',
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '200px',
    background:
      theme.palette.mode === 'dark'
        ? 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, transparent 100%)'
        : 'linear-gradient(180deg, rgba(0,0,0,0.01) 0%, transparent 100%)',
    pointerEvents: 'none',
  },
}));

const StatusSection = styled(Box)(({ theme }) => ({
  padding: theme.spacing(2.5),
  borderBottom: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
  position: 'relative',
  background:
    theme.palette.mode === 'dark'
      ? 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 100%)'
      : 'linear-gradient(135deg, rgba(0,0,0,0.02) 0%, transparent 100%)',
}));

const ConfigTitle = styled(Typography)(({ theme }) => ({
  fontSize: '1.125rem',
  fontWeight: 600,
  color: theme.palette.text.primary,
  marginBottom: theme.spacing(1),
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
}));

const SaveStatus = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
  fontSize: '0.875rem',
  color: theme.palette.text.secondary,
  transition: 'all 0.3s ease',
}));

const ProgressBar = styled(LinearProgress)(({ theme }) => ({
  height: 4,
  borderRadius: 2,
  backgroundColor: alpha(theme.palette.primary.main, 0.1),
  '& .MuiLinearProgress-bar': {
    borderRadius: 2,
    background: 'linear-gradient(90deg, #2196F3 0%, #21CBF3 100%)',
  },
}));

const StyledTabs = styled(Tabs)(({ theme }) => ({
  '& .MuiTabs-indicator': {
    left: 0,
    right: 'auto',
    width: 4,
    borderRadius: '0 2px 2px 0',
    background: 'linear-gradient(180deg, #2196F3 0%, #21CBF3 100%)',
  },
  width: '100%',
}));

const StyledTab = styled(Tab)<{ completed?: boolean }>(({ theme, completed }) => ({
  alignItems: 'center',
  textAlign: 'left',
  justifyContent: 'flex-start',
  position: 'relative',
  transition: 'all 0.2s ease',
  '&.Mui-selected': {
    backgroundColor: alpha(theme.palette.primary.main, 0.08),
    color: theme.palette.primary.main,
    '& .tab-icon': {
      color: theme.palette.primary.main,
    },
  },
  '&:hover': {
    backgroundColor: alpha(theme.palette.action.hover, 0.6),
    transform: 'translateX(2px)',
  },
  maxWidth: 'none',
  width: '100%',
  minHeight: 56,
  padding: theme.spacing(1.5, 2.5),
  textTransform: 'none',
  fontSize: '0.9375rem',
  fontWeight: 500,
  color: completed ? theme.palette.success.main : theme.palette.text.primary,
  '& .tab-content': {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1.5),
    width: '100%',
  },
  '& .tab-icon': {
    fontSize: 20,
    color: completed ? theme.palette.success.main : theme.palette.text.secondary,
    transition: 'all 0.2s ease',
  },
  '& .tab-label': {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    flex: 1,
  },
  '& .tab-shortcut': {
    fontSize: '0.75rem',
    color: theme.palette.text.disabled,
    backgroundColor: alpha(theme.palette.action.hover, 0.3),
    padding: '2px 6px',
    borderRadius: 4,
    fontFamily: 'monospace',
  },
}));

const ActionButtons = styled(Box)(({ theme }) => ({
  padding: theme.spacing(2),
  borderTop: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(1),
  background:
    theme.palette.mode === 'dark'
      ? 'linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.02) 100%)'
      : 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.01) 100%)',
}));

const PrimaryButton = styled(Button)(({ theme }) => ({
  background: 'linear-gradient(135deg, #2196F3 0%, #21CBF3 100%)',
  color: 'white',
  fontWeight: 600,
  padding: theme.spacing(1.25),
  fontSize: '0.9375rem',
  boxShadow: '0 4px 12px rgba(33, 150, 243, 0.3)',
  transition: 'all 0.3s ease',
  '&:hover': {
    background: 'linear-gradient(135deg, #1976D2 0%, #1CB5E0 100%)',
    boxShadow: '0 6px 20px rgba(33, 150, 243, 0.4)',
    transform: 'translateY(-1px)',
  },
  '&:disabled': {
    background: theme.palette.action.disabledBackground,
    color: theme.palette.action.disabled,
    boxShadow: 'none',
  },
}));

const SecondaryButton = styled(Button)(({ theme }) => ({
  color: theme.palette.text.secondary,
  fontWeight: 500,
  padding: theme.spacing(1),
  fontSize: '0.875rem',
  transition: 'all 0.2s ease',
  '&:hover': {
    backgroundColor: alpha(theme.palette.action.hover, 0.8),
    transform: 'translateX(2px)',
  },
}));

const CompletionBadge = styled(Box)(({ theme }) => ({
  width: 20,
  height: 20,
  borderRadius: '50%',
  backgroundColor: theme.palette.success.main,
  color: 'white',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  animation: 'fadeIn 0.3s ease',
  '@keyframes fadeIn': {
    from: { opacity: 0, transform: 'scale(0.8)' },
    to: { opacity: 1, transform: 'scale(1)' },
  },
}));

const PulsingDot = styled(Box)(({ theme }) => ({
  width: 8,
  height: 8,
  borderRadius: '50%',
  backgroundColor: theme.palette.warning.main,
  animation: 'pulse 2s infinite',
  '@keyframes pulse': {
    '0%': { opacity: 1, transform: 'scale(1)' },
    '50%': { opacity: 0.6, transform: 'scale(1.1)' },
    '100%': { opacity: 1, transform: 'scale(1)' },
  },
}));

export default function ModernSidebar({
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
}: ModernSidebarProps) {
  const theme = useTheme();
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);

  const completedSections = sections.filter((s) => s.completed).length;
  const progress = (completedSections / sections.length) * 100;

  const getRelativeTime = (date: string | null) => {
    if (!date) return null;
    const now = new Date();
    const saved = new Date(date);
    const diffMs = now.getTime() - saved.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return saved.toLocaleDateString();
  };

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
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [sections.length, onSectionChange, onSave]);

  return (
    <SidebarContainer>
      <StatusSection>
        <ConfigTitle>
          {configName}
          {completedSections === sections.length && (
            <CheckCircleIcon
              sx={{
                fontSize: 20,
                color: 'success.main',
                animation: 'fadeIn 0.5s ease',
              }}
            />
          )}
        </ConfigTitle>

        <SaveStatus>
          {autoSaving ? (
            <>
              <CircularProgress size={14} thickness={5} />
              <span>Saving...</span>
            </>
          ) : hasUnsavedChanges ? (
            <>
              <PulsingDot />
              <span>Unsaved changes</span>
            </>
          ) : lastSaved ? (
            <>
              <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />
              <span>Saved {getRelativeTime(lastSaved)}</span>
            </>
          ) : null}
        </SaveStatus>

        <Box sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              Progress
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {completedSections}/{sections.length}
            </Typography>
          </Box>
          <ProgressBar variant="determinate" value={progress} />
        </Box>
      </StatusSection>

      <Box sx={{ flexGrow: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <StyledTabs
          orientation="vertical"
          value={activeSection}
          onChange={(_, newValue) => onSectionChange(newValue)}
        >
          {sections.map((section, index) => (
            <StyledTab
              key={section.id}
              completed={section.completed}
              label={
                <div className="tab-content">
                  <span className="tab-icon">{section.icon}</span>
                  <span className="tab-label">
                    {section.label}
                    {section.completed && (
                      <CompletionBadge>
                        <CheckCircleIcon sx={{ fontSize: 14 }} />
                      </CompletionBadge>
                    )}
                    {section.inProgress && <CircularProgress size={16} thickness={4} />}
                  </span>
                  <span className="tab-shortcut">⌘{index + 1}</span>
                </div>
              }
            />
          ))}
        </StyledTabs>
      </Box>

      <ActionButtons>
        <PrimaryButton
          fullWidth
          startIcon={autoSaving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
          onClick={onSave}
          disabled={!hasUnsavedChanges || autoSaving}
        >
          {autoSaving ? 'Saving...' : 'Save Config'}
        </PrimaryButton>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Load saved configuration">
            <SecondaryButton fullWidth startIcon={<FolderOpenIcon />} onClick={onLoad}>
              Load
            </SecondaryButton>
          </Tooltip>

          {onDownload && (
            <Tooltip title="Export as YAML">
              <SecondaryButton fullWidth startIcon={<DownloadIcon />} onClick={onDownload}>
                Export
              </SecondaryButton>
            </Tooltip>
          )}
        </Box>

        <Tooltip title="Reset to default configuration">
          <SecondaryButton
            fullWidth
            startIcon={<RestartAltIcon />}
            onClick={onReset}
            sx={{ color: 'error.main' }}
          >
            Reset
          </SecondaryButton>
        </Tooltip>

        <Box sx={{ mt: 1, display: 'flex', justifyContent: 'center' }}>
          <Tooltip title="Show keyboard shortcuts">
            <IconButton
              size="small"
              onClick={() => setShowKeyboardShortcuts(!showKeyboardShortcuts)}
              sx={{ color: 'text.secondary' }}
            >
              <KeyboardIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        {showKeyboardShortcuts && (
          <Box
            sx={{
              mt: 1,
              p: 1.5,
              borderRadius: 1,
              backgroundColor: alpha(theme.palette.background.default, 0.6),
              fontSize: '0.75rem',
              color: 'text.secondary',
            }}
          >
            <Typography variant="caption" fontWeight="bold" display="block" gutterBottom>
              Shortcuts
            </Typography>
            <Box component="span" display="block">
              ⌘1-5: Jump to section
            </Box>
            <Box component="span" display="block">
              ⌘S: Save config
            </Box>
          </Box>
        )}
      </ActionButtons>
    </SidebarContainer>
  );
}
