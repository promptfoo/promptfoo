import React, { useState, useRef, useEffect } from 'react';

import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import CloseIcon from '@mui/icons-material/Close';
import InfoIcon from '@mui/icons-material/Info';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Fade from '@mui/material/Fade';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import { alpha, useTheme } from '@mui/material/styles';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { useResultsViewSettingsStore } from '../../store';

interface HoverInfo {
  element: HTMLElement;
  type: 'cell' | 'header' | 'prompt' | 'output';
  content?: string;
}

const SmartColumnInspector: React.FC = () => {
  const theme = useTheme();
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [pinnedColumn, setPinnedColumn] = useState<string | null>(null);
  const inspectorRef = useRef<HTMLDivElement>(null);

  const {
    maxTextLength,
    setMaxTextLength,
    renderMarkdown,
    setRenderMarkdown,
    prettifyJson,
    setPrettifyJson,
    showInferenceDetails,
    setShowInferenceDetails,
  } = useResultsViewSettingsStore();

  useEffect(() => {
    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Check if hovering over table content
      const cell = target.closest('td, th');
      if (!cell) return;

      const rect = cell.getBoundingClientRect();
      const cellType = cell.tagName === 'TH' ? 'header' : 'cell';
      const content = cell.textContent || '';

      setHoverInfo({
        element: cell as HTMLElement,
        type: cellType,
        content: content.slice(0, 100),
      });
    };

    const handleMouseOut = (e: MouseEvent) => {
      const relatedTarget = e.relatedTarget as HTMLElement;
      if (!relatedTarget?.closest('.smart-inspector')) {
        setHoverInfo(null);
      }
    };

    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);

    return () => {
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
    };
  }, []);

  const getContextualControls = () => {
    if (!hoverInfo) return null;

    const isLongText = hoverInfo.content && hoverInfo.content.length > 50;
    const hasMarkdown = hoverInfo.content?.includes('**') || hoverInfo.content?.includes('##');
    const hasJson = hoverInfo.content?.includes('{') || hoverInfo.content?.includes('[');

    return (
      <Stack spacing={2}>
        {isLongText && (
          <Box>
            <Typography variant="caption" color="text.secondary" gutterBottom display="block">
              Text Display
            </Typography>
            <Slider
              value={maxTextLength === Number.POSITIVE_INFINITY ? 1000 : maxTextLength}
              onChange={(_, value) => {
                const v = value as number;
                setMaxTextLength(v === 1000 ? Number.POSITIVE_INFINITY : v);
              }}
              min={50}
              max={1000}
              marks={[
                { value: 100, label: 'Compact' },
                { value: 500, label: 'Normal' },
                { value: 1000, label: 'Full' },
              ]}
              sx={{ width: 200 }}
            />
          </Box>
        )}

        {hasMarkdown && (
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="caption">Render Markdown</Typography>
            <Switch
              size="small"
              checked={renderMarkdown}
              onChange={(e) => setRenderMarkdown(e.target.checked)}
            />
          </Stack>
        )}

        {hasJson && (
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="caption">Format JSON</Typography>
            <Switch
              size="small"
              checked={prettifyJson}
              onChange={(e) => setPrettifyJson(e.target.checked)}
            />
          </Stack>
        )}

        <Stack direction="row" alignItems="center" spacing={1}>
          <AutoFixHighIcon fontSize="small" color="primary" />
          <Typography variant="caption" color="primary">
            AI suggests: {isLongText ? 'Increase text limit' : 'Looks good'}
          </Typography>
        </Stack>
      </Stack>
    );
  };

  if (!hoverInfo) return null;

  const rect = hoverInfo.element.getBoundingClientRect();
  const shouldShowBelow = rect.top < 300;

  return (
    <Fade in={true} timeout={200}>
      <Card
        ref={inspectorRef}
        className="smart-inspector"
        sx={{
          position: 'fixed',
          left: rect.left,
          top: shouldShowBelow ? rect.bottom + 8 : rect.top - 220,
          zIndex: 1400,
          minWidth: 280,
          maxWidth: 320,
          p: 2,
          boxShadow: theme.shadows[8],
          backgroundColor: alpha(theme.palette.background.paper, 0.98),
          backdropFilter: 'blur(20px)',
          border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
          borderRadius: 2,
          '&::before': {
            content: '""',
            position: 'absolute',
            left: 20,
            top: shouldShowBelow ? -6 : 'auto',
            bottom: shouldShowBelow ? 'auto' : -6,
            width: 12,
            height: 12,
            backgroundColor: 'inherit',
            transform: 'rotate(45deg)',
            border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
            borderTop: shouldShowBelow ? 'none' : undefined,
            borderLeft: shouldShowBelow ? 'none' : undefined,
            borderBottom: shouldShowBelow ? undefined : 'none',
            borderRight: shouldShowBelow ? undefined : 'none',
          },
        }}
      >
        <Stack spacing={2}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Stack direction="row" alignItems="center" spacing={1}>
              <InfoIcon fontSize="small" color="primary" />
              <Typography variant="subtitle2" fontWeight={600}>
                Column Settings
              </Typography>
            </Stack>
            <IconButton size="small" onClick={() => setHoverInfo(null)} sx={{ ml: 2 }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>

          {getContextualControls()}
        </Stack>
      </Card>
    </Fade>
  );
};

export default React.memo(SmartColumnInspector);
