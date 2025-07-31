import React, { useState, useEffect } from 'react';

import BugReportIcon from '@mui/icons-material/BugReport';
import CodeIcon from '@mui/icons-material/Code';
import GroupIcon from '@mui/icons-material/Group';
import PresentToAllIcon from '@mui/icons-material/PresentToAll';
import SpeedIcon from '@mui/icons-material/Speed';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grow from '@mui/material/Grow';
import Stack from '@mui/material/Stack';
import { alpha, useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { useResultsViewSettingsStore, useTableStore } from '../../store';

interface SmartPreset {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
  settings: {
    maxTextLength: number;
    showPrompts: boolean;
    showInferenceDetails: boolean;
    renderMarkdown: boolean;
    prettifyJson: boolean;
    stickyHeader: boolean;
  };
  color: string;
}

const SmartPresets: React.FC = () => {
  const theme = useTheme();
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [suggestedPreset, setSuggestedPreset] = useState<string | null>(null);
  const { table } = useTableStore();

  const {
    setMaxTextLength,
    setShowPrompts,
    setShowInferenceDetails,
    setRenderMarkdown,
    setPrettifyJson,
    setStickyHeader,
  } = useResultsViewSettingsStore();

  const presets: SmartPreset[] = [
    {
      id: 'speed',
      name: 'Speed Review',
      icon: <SpeedIcon />,
      description: 'Quickly scan through results',
      settings: {
        maxTextLength: 100,
        showPrompts: false,
        showInferenceDetails: false,
        renderMarkdown: false,
        prettifyJson: false,
        stickyHeader: true,
      },
      color: theme.palette.info.main,
    },
    {
      id: 'debug',
      name: 'Debug',
      icon: <BugReportIcon />,
      description: 'Full details for troubleshooting',
      settings: {
        maxTextLength: Number.POSITIVE_INFINITY,
        showPrompts: true,
        showInferenceDetails: true,
        renderMarkdown: true,
        prettifyJson: true,
        stickyHeader: true,
      },
      color: theme.palette.error.main,
    },
    {
      id: 'present',
      name: 'Present',
      icon: <PresentToAllIcon />,
      description: 'Clean view for sharing',
      settings: {
        maxTextLength: 250,
        showPrompts: false,
        showInferenceDetails: false,
        renderMarkdown: true,
        prettifyJson: true,
        stickyHeader: false,
      },
      color: theme.palette.success.main,
    },
    {
      id: 'compare',
      name: 'Compare',
      icon: <GroupIcon />,
      description: 'Side-by-side analysis',
      settings: {
        maxTextLength: 200,
        showPrompts: false,
        showInferenceDetails: true,
        renderMarkdown: true,
        prettifyJson: false,
        stickyHeader: true,
      },
      color: theme.palette.warning.main,
    },
    {
      id: 'code',
      name: 'Code Review',
      icon: <CodeIcon />,
      description: 'Optimized for code outputs',
      settings: {
        maxTextLength: 500,
        showPrompts: true,
        showInferenceDetails: false,
        renderMarkdown: false,
        prettifyJson: true,
        stickyHeader: true,
      },
      color: theme.palette.secondary.main,
    },
  ];

  // Smart preset suggestion based on content
  useEffect(() => {
    if (!table) return;

    const analyzeContent = () => {
      let codeCount = 0;
      let longTextCount = 0;
      let jsonCount = 0;

      // Analyze first few rows
      table.body.slice(0, 5).forEach((row) => {
        row.outputs.forEach((output) => {
          const text = output?.text || '';
          if (text.includes('function') || text.includes('class') || text.includes('import')) {
            codeCount++;
          }
          if (text.length > 500) {
            longTextCount++;
          }
          if (text.includes('{') && text.includes('}')) {
            jsonCount++;
          }
        });
      });

      // Suggest preset based on content
      if (codeCount > 3) {
        setSuggestedPreset('code');
      } else if (longTextCount > 5) {
        setSuggestedPreset('debug');
      } else if (table.body.length > 50) {
        setSuggestedPreset('speed');
      } else {
        setSuggestedPreset(null);
      }
    };

    analyzeContent();
  }, [table]);

  const applyPreset = (preset: SmartPreset) => {
    setActivePreset(preset.id);
    setMaxTextLength(preset.settings.maxTextLength);
    setShowPrompts(preset.settings.showPrompts);
    setShowInferenceDetails(preset.settings.showInferenceDetails);
    setRenderMarkdown(preset.settings.renderMarkdown);
    setPrettifyJson(preset.settings.prettifyJson);
    setStickyHeader(preset.settings.stickyHeader);

    // Auto-hide after 2 seconds
    setTimeout(() => setActivePreset(null), 2000);
  };

  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{
        position: 'fixed',
        top: 80,
        right: 24,
        zIndex: 1200,
      }}
    >
      {presets.map((preset, index) => (
        <Grow
          key={preset.id}
          in
          timeout={300 + index * 100}
          style={{ transformOrigin: 'top right' }}
        >
          <Card
            onClick={() => applyPreset(preset)}
            sx={{
              p: 1.5,
              cursor: 'pointer',
              backgroundColor: alpha(theme.palette.background.paper, 0.9),
              backdropFilter: 'blur(10px)',
              border: `2px solid ${
                activePreset === preset.id
                  ? preset.color
                  : suggestedPreset === preset.id
                    ? alpha(preset.color, 0.3)
                    : 'transparent'
              }`,
              transition: 'all 0.3s ease',
              transform: activePreset === preset.id ? 'scale(1.05)' : 'scale(1)',
              '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: theme.shadows[8],
                borderColor: preset.color,
              },
              minWidth: 120,
            }}
          >
            <Stack alignItems="center" spacing={0.5}>
              <Box
                sx={{
                  color: preset.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 40,
                  height: 40,
                  borderRadius: 2,
                  backgroundColor: alpha(preset.color, 0.1),
                }}
              >
                {preset.icon}
              </Box>
              <Typography variant="body2" fontWeight={600}>
                {preset.name}
              </Typography>
              {suggestedPreset === preset.id && (
                <Typography
                  variant="caption"
                  sx={{
                    px: 1,
                    py: 0.25,
                    borderRadius: 1,
                    backgroundColor: alpha(preset.color, 0.1),
                    color: preset.color,
                    fontWeight: 600,
                  }}
                >
                  Suggested
                </Typography>
              )}
            </Stack>
          </Card>
        </Grow>
      ))}
    </Stack>
  );
};

export default React.memo(SmartPresets);
