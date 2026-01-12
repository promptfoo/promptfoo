/**
 * ShareApp - Interactive UI for sharing eval results.
 *
 * Shows upload progress and provides the share URL.
 */

import { useEffect, useState } from 'react';

import { Box, Text, useApp, useInput } from 'ink';
import opener from 'opener';
import { Spinner } from '../components/shared';
import { copyToClipboard, isClipboardAvailable } from '../utils/clipboard';

export type SharePhase =
  | 'confirming'
  | 'preparing'
  | 'uploading'
  | 'processing'
  | 'complete'
  | 'error';

export interface ShareProgress {
  phase: SharePhase;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Share URL when complete */
  shareUrl?: string;
  /** Error message if failed */
  error?: string;
  /** Eval description */
  description?: string;
  /** Number of test results */
  resultCount?: number;
  /** Whether URL was copied to clipboard */
  copiedToClipboard?: boolean;
  /** Whether browser was opened */
  openedInBrowser?: boolean;
}

export interface ShareAppProps {
  /** Eval ID being shared */
  evalId: string;
  /** Description of the eval */
  description?: string;
  /** Number of results */
  resultCount?: number;
  /** Whether to skip confirmation */
  skipConfirmation?: boolean;
  /** Called when sharing is confirmed */
  onConfirm?: () => void;
  /** Called when sharing is cancelled */
  onCancel?: () => void;
  /** Called when complete */
  onComplete?: (shareUrl: string) => void;
}

// Type-safe global state for share UI controller communication
interface ShareGlobal {
  __shareSetProgress?: React.Dispatch<React.SetStateAction<ShareProgress>>;
}

const shareGlobal = globalThis as typeof globalThis & ShareGlobal;

function ProgressBar({ progress }: { progress: number }) {
  const width = 30;
  const filled = Math.round((progress / 100) * width);
  const empty = width - filled;

  return (
    <Box>
      <Text color="cyan">{'█'.repeat(filled)}</Text>
      <Text color="gray">{'░'.repeat(empty)}</Text>
      <Text> {Math.round(progress)}%</Text>
    </Box>
  );
}

export function ShareApp({
  evalId,
  description,
  resultCount,
  skipConfirmation = false,
  onConfirm,
  onCancel,
  onComplete,
}: ShareAppProps) {
  const { exit } = useApp();
  const [clipboardAvailable] = useState(() => isClipboardAvailable());
  const [progress, setProgress] = useState<ShareProgress>({
    phase: skipConfirmation ? 'preparing' : 'confirming',
    description,
    resultCount,
  });

  // Auto-copy URL to clipboard when sharing completes
  useEffect(() => {
    if (progress.phase === 'complete' && progress.shareUrl && clipboardAvailable) {
      void copyToClipboard(progress.shareUrl).then((result) => {
        if (result.success) {
          setProgress((prev) => ({ ...prev, copiedToClipboard: true }));
        }
      });
    }
  }, [progress.phase, progress.shareUrl, clipboardAvailable]);

  // Handle keyboard input
  useInput((input, key) => {
    if (progress.phase === 'confirming') {
      if (input === 'y' || input === 'Y' || key.return) {
        setProgress((prev) => ({ ...prev, phase: 'preparing' }));
        onConfirm?.();
      } else if (input === 'n' || input === 'N' || key.escape) {
        onCancel?.();
        exit();
      }
      return;
    }

    if (progress.phase === 'complete' || progress.phase === 'error') {
      // Open URL in browser
      if ((input === 'o' || input === 'O') && progress.shareUrl) {
        opener(progress.shareUrl);
        setProgress((prev) => ({ ...prev, openedInBrowser: true }));
        return;
      }
      // Copy URL to clipboard
      if ((input === 'c' || input === 'C') && progress.shareUrl && clipboardAvailable) {
        void copyToClipboard(progress.shareUrl).then((result) => {
          if (result.success) {
            setProgress((prev) => ({ ...prev, copiedToClipboard: true }));
          }
        });
        return;
      }
      if (input === 'q' || key.escape || key.return) {
        if (progress.shareUrl) {
          onComplete?.(progress.shareUrl);
        }
        exit();
      }
    }
  });

  // Expose update function for external control
  useEffect(() => {
    shareGlobal.__shareSetProgress = setProgress;
    return () => {
      delete shareGlobal.__shareSetProgress;
    };
  }, []);

  // Auto-start if skipping confirmation
  useEffect(() => {
    if (skipConfirmation) {
      onConfirm?.();
    }
  }, [skipConfirmation, onConfirm]);

  const phaseMessages: Record<SharePhase, string> = {
    confirming: 'Share this evaluation?',
    preparing: 'Preparing data...',
    uploading: 'Uploading results...',
    processing: 'Processing on server...',
    complete: 'Share complete!',
    error: 'Share failed',
  };

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Share Evaluation
        </Text>
      </Box>

      {/* Eval info */}
      <Box marginBottom={1} flexDirection="column">
        <Box>
          <Text dimColor>Eval ID: </Text>
          <Text>{evalId.slice(0, 20)}...</Text>
        </Box>
        {description && (
          <Box>
            <Text dimColor>Description: </Text>
            <Text>{description.slice(0, 40)}</Text>
          </Box>
        )}
        {resultCount !== undefined && (
          <Box>
            <Text dimColor>Results: </Text>
            <Text>{resultCount} test cases</Text>
          </Box>
        )}
      </Box>

      {/* Confirmation */}
      {progress.phase === 'confirming' && (
        <Box flexDirection="column" marginBottom={1}>
          <Box borderStyle="round" borderColor="yellow" padding={1}>
            <Text>
              This will upload your evaluation results to Promptfoo Cloud. Continue? (y/n)
            </Text>
          </Box>
        </Box>
      )}

      {/* Progress */}
      {['preparing', 'uploading', 'processing'].includes(progress.phase) && (
        <Box marginBottom={1}>
          <Box marginRight={2}>
            <Spinner />
          </Box>
          <Text>{phaseMessages[progress.phase]}</Text>
          {progress.progress !== undefined && (
            <Box marginLeft={2}>
              <ProgressBar progress={progress.progress} />
            </Box>
          )}
        </Box>
      )}

      {/* Complete */}
      {progress.phase === 'complete' && progress.shareUrl && (
        <Box flexDirection="column" marginBottom={1}>
          <Box marginBottom={1}>
            <Text color="green" bold>
              ✓ {phaseMessages.complete}
            </Text>
          </Box>
          <Box marginBottom={1}>
            <Text dimColor>Share URL: </Text>
            <Text color="cyan" bold>
              {progress.shareUrl}
            </Text>
          </Box>
        </Box>
      )}

      {/* Error */}
      {progress.phase === 'error' && (
        <Box flexDirection="column" marginBottom={1}>
          <Box marginBottom={1}>
            <Text color="red" bold>
              ✗ {phaseMessages.error}
            </Text>
          </Box>
          {progress.error && <Text color="red">{progress.error}</Text>}
        </Box>
      )}

      {/* Status indicators */}
      {progress.phase === 'complete' && (
        <Box marginBottom={1}>
          {progress.copiedToClipboard && (
            <Text color="green" dimColor>
              ✓ Copied to clipboard
            </Text>
          )}
          {progress.openedInBrowser && (
            <Box marginLeft={progress.copiedToClipboard ? 2 : 0}>
              <Text color="green" dimColor>
                ✓ Opened in browser
              </Text>
            </Box>
          )}
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        {progress.phase === 'confirming' && <Text dimColor>Press y to confirm, n to cancel</Text>}
        {progress.phase === 'complete' && (
          <Box>
            <Text dimColor>Press </Text>
            <Text color="yellow">o</Text>
            <Text dimColor> to open in browser</Text>
            {clipboardAvailable && (
              <>
                <Text dimColor> | </Text>
                <Text color="yellow">c</Text>
                <Text dimColor> to copy URL</Text>
              </>
            )}
            <Text dimColor> | </Text>
            <Text color="yellow">Enter</Text>
            <Text dimColor> to exit</Text>
          </Box>
        )}
        {progress.phase === 'error' && <Text dimColor>Press Enter to exit</Text>}
        {['preparing', 'uploading', 'processing'].includes(progress.phase) && (
          <Text dimColor>Please wait...</Text>
        )}
      </Box>
    </Box>
  );
}

export interface ShareController {
  setPhase(phase: SharePhase): void;
  setProgress(progress: number): void;
  complete(shareUrl: string): void;
  error(message: string): void;
}

export function createShareController(): ShareController {
  const getSetProgress = () => shareGlobal.__shareSetProgress;

  return {
    setPhase(phase) {
      getSetProgress()?.((prev: ShareProgress) => ({ ...prev, phase }));
    },

    setProgress(progressValue) {
      getSetProgress()?.((prev: ShareProgress) => ({ ...prev, progress: progressValue }));
    },

    complete(shareUrl) {
      getSetProgress()?.((prev: ShareProgress) => ({
        ...prev,
        phase: 'complete',
        shareUrl,
        progress: 100,
      }));
    },

    error(message) {
      getSetProgress()?.((prev: ShareProgress) => ({
        ...prev,
        phase: 'error',
        error: message,
      }));
    },
  };
}
