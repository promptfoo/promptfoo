import React, { useCallback, useRef, useMemo, useEffect } from 'react';
import { useToast } from '@app/hooks/useToast';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import Convert from 'ansi-to-html';

interface LogViewerProps {
  logs: string[];
}

export function LogViewer({ logs }: LogViewerProps) {
  const theme = useTheme();
  const toast = useToast();
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = React.useState(true);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const fullscreenLogsContainerRef = useRef<HTMLDivElement>(null);

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
    }
  }, [logs, shouldAutoScroll]);

  const handleScroll = useCallback(() => {
    if (logsContainerRef.current) {
      const container = logsContainerRef.current;
      const isAtBottom =
        Math.abs(container.scrollHeight - container.scrollTop - container.clientHeight) < 50;
      setShouldAutoScroll(isAtBottom);
    }
  }, []);

  const handleFullscreenScroll = useCallback(() => {
    if (fullscreenLogsContainerRef.current) {
      const container = fullscreenLogsContainerRef.current;
      const isAtBottom =
        Math.abs(container.scrollHeight - container.scrollTop - container.clientHeight) < 50;
      setShouldAutoScroll(isAtBottom);
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
          fontFamily: 'monospace',
          fontSize: '0.875rem',
          ...sx,
        }}
      >
        <Typography
          variant="body2"
          component="div"
          sx={{
            whiteSpace: 'pre-wrap',
            '& span': {
              color: theme.palette.mode === 'dark' ? 'inherit' : undefined,
            },
          }}
          dangerouslySetInnerHTML={{
            __html: logs.map((log) => convertAnsiToHtml(log)).join('<br/>'),
          }}
        />
      </Paper>
    ),
    [logs, convertAnsiToHtml, theme.palette.mode],
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

      <LogContent
        containerRef={logsContainerRef}
        onScroll={handleScroll}
        sx={{ maxHeight: '300px' }}
      />

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
        <DialogContent sx={{ p: 0 }}>
          <LogContent
            containerRef={fullscreenLogsContainerRef}
            onScroll={handleFullscreenScroll}
            sx={{ height: '100%', p: 3 }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
