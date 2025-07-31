import React, { useState, useEffect, useRef } from 'react';

import CloseIcon from '@mui/icons-material/Close';
import RemoveIcon from '@mui/icons-material/Remove';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import Box from '@mui/material/Box';
import Fade from '@mui/material/Fade';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import { alpha, useTheme } from '@mui/material/styles';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useResultsViewSettingsStore } from '../../store';

interface ToolbarState {
  visible: boolean;
  position: { x: number; y: number };
  context: 'text' | 'header' | 'cell' | null;
  selectedText?: string;
}

const AmbientToolbar: React.FC = () => {
  const theme = useTheme();
  const [toolbar, setToolbar] = useState<ToolbarState>({
    visible: false,
    position: { x: 0, y: 0 },
    context: null,
  });
  const [isHovering, setIsHovering] = useState(false);
  const hideTimeout = useRef<NodeJS.Timeout>();
  const lastInteraction = useRef<number>(Date.now());

  const {
    maxTextLength,
    setMaxTextLength,
    showPrompts,
    setShowPrompts,
    showInferenceDetails,
    setShowInferenceDetails,
    renderMarkdown,
    setRenderMarkdown,
  } = useResultsViewSettingsStore();

  // Detect user interactions
  useEffect(() => {
    const handleSelection = () => {
      const selection = window.getSelection();
      const text = selection?.toString();

      if (text && text.length > 0) {
        const range = selection?.getRangeAt(0);
        const rect = range?.getBoundingClientRect();

        if (rect) {
          setToolbar({
            visible: true,
            position: {
              x: rect.left + rect.width / 2,
              y: rect.top - 10,
            },
            context: 'text',
            selectedText: text,
          });
          lastInteraction.current = Date.now();
        }
      }
    };

    const handleScroll = () => {
      const now = Date.now();
      const timeSinceLastInteraction = now - lastInteraction.current;

      // Show toolbar if user stops scrolling
      if (timeSinceLastInteraction > 1000) {
        const scrollTop = window.scrollY;
        const viewportHeight = window.innerHeight;

        setToolbar({
          visible: true,
          position: {
            x: window.innerWidth - 200,
            y: scrollTop + viewportHeight / 2,
          },
          context: 'cell',
        });
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const cell = target.closest('td, th');

      if (cell && !toolbar.visible) {
        const rect = cell.getBoundingClientRect();
        const hasLongContent = (cell.textContent?.length || 0) > 100;

        if (hasLongContent) {
          setToolbar({
            visible: true,
            position: {
              x: rect.right - 50,
              y: rect.top + 10,
            },
            context: cell.tagName === 'TH' ? 'header' : 'cell',
          });
        }
      }
    };

    // Auto-hide logic
    const startHideTimer = () => {
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
      hideTimeout.current = setTimeout(() => {
        if (!isHovering) {
          setToolbar((prev) => ({ ...prev, visible: false }));
        }
      }, 3000);
    };

    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('scroll', handleScroll);
    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      document.removeEventListener('mouseup', handleSelection);
      document.removeEventListener('scroll', handleScroll);
      document.removeEventListener('mousemove', handleMouseMove);
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
    };
  }, [toolbar.visible, isHovering]);

  // Start hide timer when toolbar becomes visible
  useEffect(() => {
    if (toolbar.visible && !isHovering) {
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
      hideTimeout.current = setTimeout(() => {
        setToolbar((prev) => ({ ...prev, visible: false }));
      }, 3000);
    }

    return () => {
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
    };
  }, [toolbar.visible, isHovering]);

  const handleTextLengthChange = (delta: number) => {
    const current = maxTextLength === Number.POSITIVE_INFINITY ? 500 : maxTextLength;
    const newValue = Math.max(50, Math.min(1000, current + delta));
    setMaxTextLength(newValue === 1000 ? Number.POSITIVE_INFINITY : newValue);
  };

  const getContextualControls = () => {
    switch (toolbar.context) {
      case 'text':
        return (
          <Stack direction="row" spacing={1}>
            <Tooltip title="Copy selected text">
              <IconButton
                size="small"
                onClick={() => {
                  if (toolbar.selectedText) {
                    navigator.clipboard.writeText(toolbar.selectedText);
                  }
                }}
              >
                <Typography variant="caption">Copy</Typography>
              </IconButton>
            </Tooltip>
            {toolbar.selectedText && toolbar.selectedText.length > 200 && (
              <Tooltip title="Expand to read">
                <IconButton size="small">
                  <Typography variant="caption">Expand</Typography>
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        );

      case 'cell':
        return (
          <Stack direction="row" spacing={1} alignItems="center">
            {/* Text length control */}
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <IconButton
                size="small"
                onClick={() => handleTextLengthChange(-50)}
                disabled={maxTextLength <= 50}
              >
                <RemoveIcon fontSize="small" />
              </IconButton>
              <Typography variant="caption" sx={{ minWidth: 40, textAlign: 'center' }}>
                {maxTextLength === Number.POSITIVE_INFINITY ? '∞' : maxTextLength}
              </Typography>
              <IconButton size="small" onClick={() => handleTextLengthChange(50)}>
                <AddIcon fontSize="small" />
              </IconButton>
            </Stack>

            <Box
              sx={{ width: 1, height: 20, backgroundColor: alpha(theme.palette.divider, 0.2) }}
            />

            {/* Quick toggles */}
            <ToggleButtonGroup size="small">
              <ToggleButton
                value="prompts"
                selected={showPrompts}
                onChange={() => setShowPrompts(!showPrompts)}
              >
                <Tooltip title="Show prompts">
                  <Typography variant="caption">P</Typography>
                </Tooltip>
              </ToggleButton>
              <ToggleButton
                value="details"
                selected={showInferenceDetails}
                onChange={() => setShowInferenceDetails(!showInferenceDetails)}
              >
                <Tooltip title="Show details">
                  <Typography variant="caption">D</Typography>
                </Tooltip>
              </ToggleButton>
              <ToggleButton
                value="markdown"
                selected={renderMarkdown}
                onChange={() => setRenderMarkdown(!renderMarkdown)}
              >
                <Tooltip title="Render markdown">
                  <Typography variant="caption">M</Typography>
                </Tooltip>
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        );

      default:
        return null;
    }
  };

  if (!toolbar.visible) return null;

  return (
    <Fade in timeout={200}>
      <Paper
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        elevation={8}
        sx={{
          position: 'fixed',
          left: toolbar.position.x,
          top: toolbar.position.y,
          transform: 'translate(-50%, -100%)',
          px: 2,
          py: 1,
          backgroundColor: alpha(theme.palette.background.paper, 0.95),
          backdropFilter: 'blur(10px)',
          borderRadius: 2,
          zIndex: 1300,
          transition: 'opacity 0.2s ease',
          '&::after': {
            content: '""',
            position: 'absolute',
            left: '50%',
            bottom: -6,
            transform: 'translateX(-50%)',
            width: 12,
            height: 12,
            backgroundColor: 'inherit',
            borderRadius: '0 0 2px 0',
            transform: 'translateX(-50%) rotate(45deg)',
          },
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          {getContextualControls()}
          <IconButton
            size="small"
            onClick={() => setToolbar({ ...toolbar, visible: false })}
            sx={{ ml: 1 }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Paper>
    </Fade>
  );
};

export default React.memo(AmbientToolbar);
