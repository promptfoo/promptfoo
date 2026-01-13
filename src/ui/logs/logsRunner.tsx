/**
 * Entry point for the interactive log viewer.
 * Uses dynamic imports to avoid loading Ink/React when promptfoo is used as a library.
 *
 * Supports live tail mode for real-time log following.
 */

import fsSync from 'fs';
import fs from 'fs/promises';

import debounce from 'debounce';
import logger from '../../logger';

export interface LogViewerOptions {
  /** Path to the log file */
  filePath: string;
  /** Initial search/grep pattern */
  grep?: string;
  /** Whether to enable live tail mode */
  live?: boolean;
}

/**
 * Read log file content
 */
async function readLogFile(filePath: string): Promise<string[]> {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');

  // Remove trailing empty line if present
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines;
}

/**
 * Run the interactive log viewer
 */
export async function runInteractiveLogViewer(options: LogViewerOptions): Promise<void> {
  const { filePath, grep, live = false } = options;

  // Dynamically import React and Ink to avoid loading when used as library
  const [React, { render }, { LogViewer }] = await Promise.all([
    import('react'),
    import('ink'),
    import('./LogViewer'),
  ]);

  // Get file stats
  const stats = await fs.stat(filePath);

  // Read initial log content
  let lines = await readLogFile(filePath);

  if (lines.length === 0 && !live) {
    logger.info('Log file is empty.');
    return;
  }

  // Check if this is the current session's log
  const cliState = await import('../../cliState').then((m) => m.default);
  const isCurrentSession = filePath === cliState.debugLogFile || filePath === cliState.errorLogFile;

  // Enable live mode for current session logs by default
  const enableLive = live || isCurrentSession;

  // State management for live updates
  let updateCallback: ((newLines: string[]) => void) | null = null;
  let watcher: fsSync.FSWatcher | null = null;

  // Wrapper component for live updates
  function LiveLogViewer(): React.ReactElement {
    const [currentLines, setCurrentLines] = React.useState(lines);

    // Register update callback
    React.useEffect(() => {
      updateCallback = (newLines: string[]) => {
        setCurrentLines(newLines);
      };
      return () => {
        updateCallback = null;
      };
    }, []);

    return React.createElement(LogViewer, {
      lines: currentLines,
      filePath,
      fileSize: stats.size,
      isCurrentSession,
      initialSearch: grep,
      isLive: enableLive,
    });
  }

  // Set up file watcher for live mode
  if (enableLive) {
    let lastSize = stats.size;

    const handleChange = debounce(async () => {
      try {
        const newStats = await fs.stat(filePath);
        const newSize = newStats.size;

        if (newSize !== lastSize) {
          lastSize = newSize;
          const newLines = await readLogFile(filePath);
          lines = newLines;
          if (updateCallback) {
            updateCallback(newLines);
          }
        }
      } catch (error) {
        // File may have been rotated or deleted
        logger.debug(`Error reading log file: ${error instanceof Error ? error.message : error}`);
      }
    }, 100);

    watcher = fsSync.watch(filePath);
    watcher.on('change', handleChange);
    watcher.on('error', (error) => {
      logger.debug(`File watcher error: ${error}`);
    });
  }

  // Render the viewer
  const { waitUntilExit, unmount } = render(React.createElement(LiveLogViewer), {
    exitOnCtrlC: true,
  });

  // Cleanup on exit
  const cleanup = () => {
    if (watcher) {
      watcher.close();
      watcher = null;
    }
  };

  try {
    await waitUntilExit();
  } finally {
    cleanup();
    unmount();
  }
}

export default runInteractiveLogViewer;
