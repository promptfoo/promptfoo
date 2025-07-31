import React, { useState, useEffect } from 'react';

import BugReportIcon from '@mui/icons-material/BugReport';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import FindInPageIcon from '@mui/icons-material/FindInPage';
import PresentToAllIcon from '@mui/icons-material/PresentToAll';
import ScienceIcon from '@mui/icons-material/Science';
import Box from '@mui/material/Box';
import Fade from '@mui/material/Fade';
import { alpha, useTheme } from '@mui/material/styles';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { useResultsViewSettingsStore, useTableStore } from '../../store';

interface WorkflowMode {
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut: string;
  settings: {
    maxTextLength: number;
    showPrompts: boolean;
    showInferenceDetails: boolean;
    renderMarkdown: boolean;
    prettifyJson: boolean;
    stickyHeader: boolean;
    showPassFail: boolean;
  };
  description: string;
}

const WORKFLOW_MODES: WorkflowMode[] = [
  {
    id: 'scan',
    label: 'Scan',
    icon: <FindInPageIcon />,
    shortcut: 'S',
    description: 'Quickly identify failures and outliers',
    settings: {
      maxTextLength: 100,
      showPrompts: false,
      showInferenceDetails: false,
      renderMarkdown: false,
      prettifyJson: false,
      stickyHeader: true,
      showPassFail: true,
    },
  },
  {
    id: 'debug',
    label: 'Debug',
    icon: <BugReportIcon />,
    shortcut: 'D',
    description: 'Full details for root cause analysis',
    settings: {
      maxTextLength: Number.POSITIVE_INFINITY,
      showPrompts: true,
      showInferenceDetails: true,
      renderMarkdown: true,
      prettifyJson: true,
      stickyHeader: true,
      showPassFail: true,
    },
  },
  {
    id: 'compare',
    label: 'Compare',
    icon: <CompareArrowsIcon />,
    shortcut: 'C',
    description: 'Side-by-side model comparison',
    settings: {
      maxTextLength: 300,
      showPrompts: false,
      showInferenceDetails: true,
      renderMarkdown: true,
      prettifyJson: false,
      stickyHeader: true,
      showPassFail: true,
    },
  },
  {
    id: 'analyze',
    label: 'Analyze',
    icon: <ScienceIcon />,
    shortcut: 'A',
    description: 'Statistical analysis and patterns',
    settings: {
      maxTextLength: 200,
      showPrompts: false,
      showInferenceDetails: true,
      renderMarkdown: false,
      prettifyJson: false,
      stickyHeader: true,
      showPassFail: true,
    },
  },
  {
    id: 'present',
    label: 'Present',
    icon: <PresentToAllIcon />,
    shortcut: 'P',
    description: 'Clean view for stakeholders',
    settings: {
      maxTextLength: 250,
      showPrompts: false,
      showInferenceDetails: false,
      renderMarkdown: true,
      prettifyJson: true,
      stickyHeader: false,
      showPassFail: true,
    },
  },
];

const WorkflowModeBar: React.FC = () => {
  const theme = useTheme();
  const [activeMode, setActiveMode] = useState('scan');
  const [showDescription, setShowDescription] = useState(false);
  const { table } = useTableStore();

  const {
    setMaxTextLength,
    setShowPrompts,
    setShowInferenceDetails,
    setRenderMarkdown,
    setPrettifyJson,
    setStickyHeader,
    setShowPassFail,
  } = useResultsViewSettingsStore();

  const applyMode = (mode: WorkflowMode) => {
    setActiveMode(mode.id);
    const { settings } = mode;
    setMaxTextLength(settings.maxTextLength);
    setShowPrompts(settings.showPrompts);
    setShowInferenceDetails(settings.showInferenceDetails);
    setRenderMarkdown(settings.renderMarkdown);
    setPrettifyJson(settings.prettifyJson);
    setStickyHeader(settings.stickyHeader);
    setShowPassFail(settings.showPassFail);

    // Show description briefly
    setShowDescription(true);
    setTimeout(() => setShowDescription(false), 2000);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const mode = WORKFLOW_MODES.find((m) => m.shortcut.toLowerCase() === e.key.toLowerCase());
      if (mode && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        applyMode(mode);
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, []);

  // Smart mode suggestion based on table state
  useEffect(() => {
    if (!table) return;

    // Auto-switch to debug mode if high failure rate
    const failureRate =
      table.body.reduce((acc, row) => {
        const failures = row.outputs.filter((o) => o?.pass === false).length;
        return acc + failures;
      }, 0) /
      (table.body.length * table.head.prompts.length);

    if (failureRate > 0.3 && activeMode === 'scan') {
      // High failure rate, suggest debug mode
      console.log('High failure rate detected, consider Debug mode');
    }
  }, [table, activeMode]);

  const currentMode = WORKFLOW_MODES.find((m) => m.id === activeMode);

  return (
    <>
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 1100,
          backgroundColor: alpha(theme.palette.background.default, 0.95),
          backdropFilter: 'blur(10px)',
          borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
          px: 3,
          pt: 2,
        }}
      >
        <Tabs
          value={activeMode}
          onChange={(_, value) => applyMode(WORKFLOW_MODES.find((m) => m.id === value)!)}
          sx={{
            minHeight: 48,
            '& .MuiTabs-indicator': {
              height: 3,
              borderRadius: '3px 3px 0 0',
            },
            '& .MuiTab-root': {
              minHeight: 48,
              textTransform: 'none',
              fontWeight: 500,
              fontSize: '0.875rem',
              mx: 1,
              px: 2,
              '&:hover': {
                backgroundColor: alpha(theme.palette.primary.main, 0.04),
                borderRadius: '8px 8px 0 0',
              },
            },
          }}
        >
          {WORKFLOW_MODES.map((mode) => (
            <Tab
              key={mode.id}
              value={mode.id}
              icon={mode.icon}
              iconPosition="start"
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {mode.label}
                  <Typography
                    variant="caption"
                    sx={{
                      px: 0.75,
                      py: 0.25,
                      borderRadius: 1,
                      backgroundColor: alpha(theme.palette.text.secondary, 0.1),
                      fontFamily: 'monospace',
                      fontSize: '0.7rem',
                    }}
                  >
                    {mode.shortcut}
                  </Typography>
                </Box>
              }
            />
          ))}
        </Tabs>
      </Box>

      {/* Mode Description Tooltip */}
      <Fade in={showDescription}>
        <Box
          sx={{
            position: 'fixed',
            top: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            px: 3,
            py: 1.5,
            backgroundColor: alpha(theme.palette.primary.main, 0.9),
            color: 'white',
            borderRadius: 2,
            boxShadow: theme.shadows[8],
            zIndex: 1200,
          }}
        >
          <Typography variant="body2" fontWeight={500}>
            {currentMode?.description}
          </Typography>
        </Box>
      </Fade>
    </>
  );
};

export default React.memo(WorkflowModeBar);
