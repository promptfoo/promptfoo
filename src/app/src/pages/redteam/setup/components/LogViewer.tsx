import React, { useCallback, useEffect, useMemo, useRef } from 'react';

import { useToast } from '@app/hooks/useToast';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import KeyboardDoubleArrowDownIcon from '@mui/icons-material/KeyboardDoubleArrowDown';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Fab from '@mui/material/Fab';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import Convert from 'ansi-to-html';

interface LogViewerProps {
  logs: string[];
}

interface LogSection {
  type:
    | 'phase'
    | 'progress'
    | 'table'
    | 'summary'
    | 'separator'
    | 'regular'
    | 'plugin-list'
    | 'status-update';
  content: string[];
  title?: string;
  progress?: { current: number; total: number };
  metadata?: Record<string, any>;
}

export function LogViewer({ logs }: LogViewerProps) {
  const theme = useTheme();
  const toast = useToast();
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = React.useState(true);
  const [showScrollButton, setShowScrollButton] = React.useState(false);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const fullscreenLogsContainerRef = useRef<HTMLDivElement>(null);
  const previousScrollPositionRef = useRef<{ main: number; fullscreen: number }>({
    main: 0,
    fullscreen: 0,
  });

  const ansiConverter = useMemo(
    () =>
      new Convert({
        fg: theme.palette.mode === 'dark' ? '#fff' : '#000',
        bg: theme.palette.mode === 'dark' ? '#1e1e1e' : '#fff',
        newline: true,
        escapeXML: true,
        stream: false,
      }),
    [theme.palette.mode],
  );

  const convertAnsiToHtml = useCallback(
    (text: string) => {
      try {
        return ansiConverter.toHtml(text);
      } catch (e) {
        console.error('Failed to convert ANSI to HTML:', e);
        return text;
      }
    },
    [ansiConverter],
  );

  const parseLogSections = useMemo((): LogSection[] => {
    const sections: LogSection[] = [];
    let currentSection: LogSection | null = null;
    let i = 0;

    while (i < logs.length) {
      const line = logs[i];
      const trimmed = line.trim();

      // Status updates
      if (trimmed.startsWith('Emitting update for eval:')) {
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = {
          type: 'status-update',
          content: [line],
          title: trimmed.replace('Emitting update for eval:', '').trim(),
        };
        i++;
        continue;
      }

      // Phase headers
      if (
        trimmed.includes('Generating test cases...') ||
        trimmed.includes('Running scan...') ||
        trimmed.includes('Starting evaluation') ||
        trimmed.includes('Red team scan complete!')
      ) {
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = {
          type: 'phase',
          content: [line],
          title: trimmed,
        };
        i++;
        continue;
      }

      // Progress indicators
      const progressMatch = trimmed.match(/^\[(\d+)\/(\d+)\]\s+Running/);
      if (progressMatch) {
        const current = parseInt(progressMatch[1]);
        const total = parseInt(progressMatch[2]);

        if (currentSection?.type !== 'progress') {
          if (currentSection) {
            sections.push(currentSection);
          }
          currentSection = {
            type: 'progress',
            content: [],
            title: 'Running Tests',
            progress: { current, total },
          };
        }

        currentSection.content.push(line);
        currentSection.progress = { current, total };
        i++;
        continue;
      }

      // Plugin lists (lines with ANSI color codes for plugins)
      if (trimmed.match(/^\[33m\w+.*\(\d+\s+tests\)\[39m$/)) {
        if (currentSection?.type !== 'plugin-list') {
          if (currentSection) {
            sections.push(currentSection);
          }
          currentSection = {
            type: 'plugin-list',
            content: [],
            title: 'Active Plugins',
          };
        }
        currentSection.content.push(line);
        i++;
        continue;
      }

      // ASCII tables (detect table borders)
      if (trimmed.match(/^[┌├└│─┐┤┘┬┴┼]+$/) || trimmed.includes('│')) {
        if (currentSection?.type !== 'table') {
          if (currentSection) {
            sections.push(currentSection);
          }
          currentSection = {
            type: 'table',
            content: [],
            title: 'Test Generation Report',
          };
        }
        currentSection.content.push(line);
        i++;
        continue;
      }

      // Separators
      if (trimmed.match(/^=+$/)) {
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = {
          type: 'separator',
          content: [line],
        };
        i++;
        continue;
      }

      // Summary sections (lines with bold formatting and colons)
      if (
        trimmed.match(/^\[1m.*Summary.*\[22m/) ||
        trimmed.match(/^\[32m✔\[39m\s+Evaluation complete/) ||
        trimmed.match(/^\[1m.*Usage.*\[22m/) ||
        trimmed.match(/^\[90mDuration:/) ||
        trimmed.match(/^\[32m\[1m.*\[22m\[39m$/) ||
        trimmed.match(/^\[31m\[1m.*\[22m\[39m$/) ||
        trimmed.match(/^\[34m\[1m.*\[22m\[39m$/)
      ) {
        if (currentSection?.type !== 'summary') {
          if (currentSection) sections.push(currentSection);
          currentSection = {
            type: 'summary',
            content: [],
            title: 'Results Summary',
          };
        }
        currentSection.content.push(line);
        i++;
        continue;
      }

      // Regular content
      if (
        !currentSection ||
        currentSection.type === 'separator' ||
        currentSection.type === 'status-update'
      ) {
        if (currentSection) sections.push(currentSection);
        currentSection = {
          type: 'regular',
          content: [line],
        };
      } else {
        currentSection.content.push(line);
      }

      i++;
    }

    if (currentSection) sections.push(currentSection);
    return sections;
  }, [logs]);

  // Auto-scroll effect
  useEffect(() => {
    if (shouldAutoScroll) {
      if (logsContainerRef.current) {
        const container = logsContainerRef.current;
        container.scrollTop = container.scrollHeight;
      }
      if (fullscreenLogsContainerRef.current) {
        const container = fullscreenLogsContainerRef.current;
        container.scrollTop = container.scrollHeight;
      }
    } else {
      // Restore previous scroll positions
      if (logsContainerRef.current) {
        logsContainerRef.current.scrollTop = previousScrollPositionRef.current.main;
      }
      if (fullscreenLogsContainerRef.current) {
        fullscreenLogsContainerRef.current.scrollTop = previousScrollPositionRef.current.fullscreen;
      }
    }
  }, [logs, shouldAutoScroll]);

  const scrollToBottom = useCallback((containerRef: React.RefObject<HTMLDivElement | null>) => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      setShouldAutoScroll(true);
    }
  }, []);

  const handleScroll = useCallback(() => {
    if (logsContainerRef.current) {
      const container = logsContainerRef.current;
      const isAtBottom =
        Math.abs(container.scrollHeight - container.scrollTop - container.clientHeight) < 50;
      setShouldAutoScroll(isAtBottom);
      setShowScrollButton(!isAtBottom);
      previousScrollPositionRef.current.main = container.scrollTop;
    }
  }, []);

  const handleFullscreenScroll = useCallback(() => {
    if (fullscreenLogsContainerRef.current) {
      const container = fullscreenLogsContainerRef.current;
      const isAtBottom =
        Math.abs(container.scrollHeight - container.scrollTop - container.clientHeight) < 50;
      setShouldAutoScroll(isAtBottom);
      setShowScrollButton(!isAtBottom);
      previousScrollPositionRef.current.fullscreen = container.scrollTop;
    }
  }, []);

  const handleOpenFullscreen = () => setIsFullscreen(true);
  const handleCloseFullscreen = () => setIsFullscreen(false);

  const handleCopyLogs = useCallback(() => {
    const plainText = logs.join('\n');
    navigator.clipboard.writeText(plainText).then(
      () => {
        toast.showToast('Logs copied to clipboard', 'success');
      },
      (err) => {
        console.error('Failed to copy logs:', err);
        toast.showToast('Failed to copy logs to clipboard', 'error');
      },
    );
  }, [logs, toast]);

  const handleSaveLogs = useCallback(() => {
    const plainText = logs.join('\n');
    const blob = new Blob([plainText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'redteam-logs.txt';
    link.click();
    URL.revokeObjectURL(url);
    toast.showToast('Logs saved successfully', 'success');
  }, [logs, toast]);

  const renderSection = useCallback(
    (section: LogSection, index: number) => {
      const key = `section-${index}`;

      switch (section.type) {
        case 'status-update':
          return (
            <Box key={key} sx={{ mb: 2 }}>
              <Chip
                label={section.title}
                color="info"
                variant="outlined"
                size="small"
                sx={{ mb: 1 }}
              />
            </Box>
          );

        case 'phase':
          return (
            <Box key={key} sx={{ mb: 2 }}>
              <Typography
                variant="h6"
                sx={{
                  color: theme.palette.primary.main,
                  fontWeight: 'bold',
                  mb: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                {section.title}
              </Typography>
              {section.content.length > 1 && (
                <Box sx={{ pl: 2 }}>
                  {section.content.slice(1).map((line, i) => (
                    <Typography
                      key={i}
                      variant="body2"
                      sx={{ fontFamily: 'monospace', color: 'text.secondary' }}
                      dangerouslySetInnerHTML={{ __html: convertAnsiToHtml(line) }}
                    />
                  ))}
                </Box>
              )}
            </Box>
          );

        case 'progress':
          const progress = section.progress;
          const percentage = progress ? (progress.current / progress.total) * 100 : 0;

          return (
            <Box key={key} sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                <Typography variant="subtitle2" sx={{ color: theme.palette.success.main }}>
                  {section.title}
                </Typography>
                {progress && (
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {progress.current}/{progress.total} ({Math.round(percentage)}%)
                  </Typography>
                )}
              </Box>
              {progress && (
                <LinearProgress
                  variant="determinate"
                  value={percentage}
                  sx={{ mb: 1, height: 6, borderRadius: 3 }}
                />
              )}
              <Box
                sx={{
                  maxHeight: '200px',
                  overflow: 'auto',
                  backgroundColor: theme.palette.action.hover,
                  borderRadius: 1,
                  p: 1,
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                }}
              >
                {section.content.slice(-10).map((line, i) => (
                  <Typography
                    key={i}
                    variant="body2"
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      color: 'text.secondary',
                    }}
                    dangerouslySetInnerHTML={{ __html: convertAnsiToHtml(line) }}
                  />
                ))}
              </Box>
            </Box>
          );

        case 'plugin-list':
          return (
            <Box key={key} sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, color: theme.palette.warning.main }}>
                {section.title}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {section.content.map((line, i) => {
                  const match = line.match(/\[33m(\w+[^(]*)\s*\((\d+)\s+tests\)\[39m/);
                  if (match) {
                    return (
                      <Chip
                        key={i}
                        label={`${match[1]} (${match[2]} tests)`}
                        color="warning"
                        variant="outlined"
                        size="small"
                      />
                    );
                  }
                  return null;
                })}
              </Box>
            </Box>
          );

        case 'table':
          return (
            <Box key={key} sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {section.title}
              </Typography>
              <Paper
                elevation={1}
                sx={{
                  p: 2,
                  backgroundColor: theme.palette.action.hover,
                  borderRadius: 1,
                  overflow: 'auto',
                }}
              >
                <Typography
                  variant="body2"
                  component="pre"
                  sx={{
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    whiteSpace: 'pre',
                    margin: 0,
                    '& span': {
                      color: theme.palette.mode === 'dark' ? 'inherit' : undefined,
                    },
                  }}
                  dangerouslySetInnerHTML={{
                    __html: section.content.map((line) => convertAnsiToHtml(line)).join('\n'),
                  }}
                />
              </Paper>
            </Box>
          );

        case 'summary':
          return (
            <Box key={key} sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, color: theme.palette.success.main }}>
                {section.title}
              </Typography>
              <Paper
                elevation={1}
                sx={{
                  p: 2,
                  backgroundColor: theme.palette.success.light + '10',
                  borderLeft: `4px solid ${theme.palette.success.main}`,
                  borderRadius: 1,
                }}
              >
                {section.content.map((line, i) => (
                  <Typography
                    key={i}
                    variant="body2"
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: '0.875rem',
                      '& span': {
                        color: theme.palette.mode === 'dark' ? 'inherit' : undefined,
                      },
                    }}
                    dangerouslySetInnerHTML={{ __html: convertAnsiToHtml(line) }}
                  />
                ))}
              </Paper>
            </Box>
          );

        case 'separator':
          return <Divider key={key} sx={{ my: 2 }} />;

        case 'regular':
        default:
          return (
            <Box key={key} sx={{ mb: 1 }}>
              {section.content.map((line, i) => (
                <Typography
                  key={i}
                  variant="body2"
                  sx={{
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                    '& span': {
                      color: theme.palette.mode === 'dark' ? 'inherit' : undefined,
                    },
                  }}
                  dangerouslySetInnerHTML={{ __html: convertAnsiToHtml(line) }}
                />
              ))}
            </Box>
          );
      }
    },
    [convertAnsiToHtml, theme],
  );

  const LogContent = useCallback(
    ({ containerRef, onScroll, sx }: any) => (
      <Paper
        elevation={1}
        ref={containerRef}
        onScroll={onScroll}
        sx={{
          p: 2,
          overflow: 'auto',
          backgroundColor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#f5f5f5',
          ...sx,
        }}
      >
        {parseLogSections.map((section, index) => renderSection(section, index))}
      </Paper>
    ),
    [parseLogSections, renderSection, theme.palette.mode],
  );

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2, mb: 1 }}>
        <Typography variant="subtitle2">Logs</Typography>
        <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
          <Button size="small" startIcon={<ContentCopyIcon />} onClick={handleCopyLogs}>
            Copy
          </Button>
          <Button size="small" startIcon={<DownloadIcon />} onClick={handleSaveLogs}>
            Save
          </Button>
          <Button size="small" startIcon={<FullscreenIcon />} onClick={handleOpenFullscreen}>
            Fullscreen
          </Button>
        </Box>
      </Box>

      <Box sx={{ position: 'relative' }}>
        <LogContent
          containerRef={logsContainerRef}
          onScroll={handleScroll}
          sx={{ maxHeight: '600px' }}
        />
        {showScrollButton && !isFullscreen && (
          <Fab
            size="small"
            color="primary"
            sx={{
              position: 'absolute',
              right: 16,
              bottom: 16,
              zIndex: 1,
            }}
            onClick={() => scrollToBottom(logsContainerRef)}
          >
            <KeyboardDoubleArrowDownIcon />
          </Fab>
        )}
      </Box>

      <Dialog
        open={isFullscreen}
        onClose={handleCloseFullscreen}
        maxWidth={false}
        fullWidth
        fullScreen
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            Logs
            <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
              <Button size="small" startIcon={<ContentCopyIcon />} onClick={handleCopyLogs}>
                Copy
              </Button>
              <Button size="small" startIcon={<DownloadIcon />} onClick={handleSaveLogs}>
                Save
              </Button>
              <Button size="small" onClick={handleCloseFullscreen}>
                Exit Fullscreen
              </Button>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 0, position: 'relative' }}>
          <LogContent
            containerRef={fullscreenLogsContainerRef}
            onScroll={handleFullscreenScroll}
            sx={{ height: '100%', p: 3 }}
          />
          {showScrollButton && isFullscreen && (
            <Fab
              size="small"
              color="primary"
              sx={{
                position: 'fixed',
                right: 16,
                bottom: 16,
                zIndex: 1,
              }}
              onClick={() => scrollToBottom(fullscreenLogsContainerRef)}
            >
              <KeyboardDoubleArrowDownIcon />
            </Fab>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
