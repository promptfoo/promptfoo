import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@app/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@app/components/ui/dialog';
import { useToast } from '@app/hooks/useToast';
import { cn } from '@app/lib/utils';
import Convert from 'ansi-to-html';
import { ChevronsDown, Copy, Download, Maximize2 } from 'lucide-react';

interface LogViewerProps {
  logs: string[];
}

export function LogViewer({ logs }: LogViewerProps) {
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

  // Detect dark mode from data-theme attribute with reactive updates
  const [isDarkMode, setIsDarkMode] = useState(
    () => typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark',
  );

  useEffect(() => {
    const element = document.documentElement;
    const updateTheme = () => {
      setIsDarkMode(element.dataset.theme === 'dark');
    };

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
          updateTheme();
          break;
        }
      }
    });

    observer.observe(element, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      observer.disconnect();
    };
  }, []);

  const ansiConverter = useMemo(
    () =>
      new Convert({
        fg: isDarkMode ? '#fff' : '#000',
        bg: isDarkMode ? '#1e1e1e' : '#fff',
        newline: true,
        escapeXML: true,
        stream: false,
      }),
    [isDarkMode],
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
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

  const LogContent = useCallback(
    ({
      containerRef,
      onScroll,
      className,
    }: {
      containerRef: React.RefObject<HTMLDivElement | null>;
      onScroll: () => void;
      className?: string;
    }) => (
      <div
        ref={containerRef}
        onScroll={onScroll}
        className={cn(
          'overflow-auto rounded-md border border-border bg-muted/50 p-4 font-mono text-sm dark:bg-zinc-900',
          className,
        )}
      >
        <div
          className="min-w-max whitespace-pre"
          dangerouslySetInnerHTML={{
            __html: logs.map((log) => convertAnsiToHtml(log)).join('<br/>'),
          }}
        />
      </div>
    ),
    [logs, convertAnsiToHtml],
  );

  return (
    <>
      <div className="mb-2 mt-4 flex items-center gap-2">
        <p className="text-sm font-medium">Logs</p>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" size="sm" onClick={handleCopyLogs}>
            <Copy className="mr-1 size-4" />
            Copy
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSaveLogs}>
            <Download className="mr-1 size-4" />
            Save
          </Button>
          <Button variant="ghost" size="sm" onClick={handleOpenFullscreen}>
            <Maximize2 className="mr-1 size-4" />
            Fullscreen
          </Button>
        </div>
      </div>

      <div className="relative">
        <LogContent
          containerRef={logsContainerRef}
          onScroll={handleScroll}
          className="max-h-[600px]"
        />
        {showScrollButton && !isFullscreen && (
          <Button
            size="icon"
            className="absolute bottom-4 right-4 size-8 rounded-full shadow-md"
            onClick={() => scrollToBottom(logsContainerRef)}
          >
            <ChevronsDown className="size-4" />
          </Button>
        )}
      </div>

      <Dialog open={isFullscreen} onOpenChange={(open) => !open && handleCloseFullscreen()}>
        <DialogContent className="h-screen max-w-none p-0 sm:max-w-none">
          <DialogHeader className="flex flex-row items-center justify-between border-b border-border px-4 py-3">
            <DialogTitle>Logs</DialogTitle>
            <div className="mr-8 flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleCopyLogs}>
                <Copy className="mr-1 size-4" />
                Copy
              </Button>
              <Button variant="ghost" size="sm" onClick={handleSaveLogs}>
                <Download className="mr-1 size-4" />
                Save
              </Button>
              <Button variant="ghost" size="sm" onClick={handleCloseFullscreen}>
                Exit Fullscreen
              </Button>
            </div>
          </DialogHeader>
          <div className="relative h-[calc(100vh-80px)]">
            <LogContent
              containerRef={fullscreenLogsContainerRef}
              onScroll={handleFullscreenScroll}
              className="h-full p-6"
            />
            {showScrollButton && isFullscreen && (
              <Button
                size="icon"
                className="fixed bottom-4 right-4 size-8 rounded-full shadow-md"
                onClick={() => scrollToBottom(fullscreenLogsContainerRef)}
              >
                <ChevronsDown className="size-4" />
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
