/**
 * CacheApp - Interactive UI for cache management.
 *
 * Shows cache statistics and allows clearing operations.
 */

import { useEffect, useState } from 'react';

import { Box, Text, useApp, useInput } from 'ink';
import { Spinner } from '../components/shared';

export interface CacheStats {
  /** Total size in bytes */
  totalSize: number;
  /** Number of cached items */
  itemCount: number;
  /** Cache directory path */
  cachePath: string;
  /** Whether cache is enabled */
  enabled: boolean;
}

export interface CacheAppProps {
  /** Initial stats to display */
  stats?: CacheStats;
  /** Called when user requests clear */
  onClear?: () => Promise<void>;
  /** Called when user wants to exit */
  onExit?: () => void;
  /** Called to refresh stats */
  onRefresh?: () => Promise<CacheStats>;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return '0 B';
  }
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function CacheApp({ stats: initialStats, onClear, onExit, onRefresh }: CacheAppProps) {
  const { exit } = useApp();
  const [stats, setStats] = useState<CacheStats | null>(initialStats || null);
  const [loading, setLoading] = useState(!initialStats);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Load initial stats
  useEffect(() => {
    if (!initialStats && onRefresh) {
      setLoading(true);
      onRefresh()
        .then((data) => {
          setStats(data);
          setLoading(false);
        })
        .catch((err) => {
          setMessage({ text: err.message, type: 'error' });
          setLoading(false);
        });
    }
  }, []);

  // Keyboard handling
  useInput((input, key) => {
    // Handle confirmation dialog
    if (confirmClear) {
      if (input === 'y' || input === 'Y') {
        handleClear();
        setConfirmClear(false);
      } else if (input === 'n' || input === 'N' || key.escape) {
        setConfirmClear(false);
      }
      return;
    }

    // Actions
    if (input === 'c' || input === 'C') {
      if (stats && stats.itemCount > 0) {
        setConfirmClear(true);
      }
    } else if (input === 'r' || input === 'R') {
      handleRefresh();
    } else if (input === 'q' || key.escape) {
      onExit?.();
      exit();
    }
  });

  const handleClear = async () => {
    if (!onClear) {
      return;
    }

    setClearing(true);
    setMessage(null);

    try {
      await onClear();
      setMessage({
        text: 'Cache cleared successfully',
        type: 'success',
      });
      // Refresh stats after clearing
      if (onRefresh) {
        const newStats = await onRefresh();
        setStats(newStats);
      }
    } catch (err) {
      setMessage({ text: (err as Error).message, type: 'error' });
    } finally {
      setClearing(false);
    }
  };

  const handleRefresh = async () => {
    if (!onRefresh) {
      return;
    }

    setLoading(true);
    try {
      const newStats = await onRefresh();
      setStats(newStats);
      setMessage({ text: 'Cache stats refreshed', type: 'success' });
    } catch (err) {
      setMessage({ text: (err as Error).message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Cache Management
        </Text>
        {loading && (
          <>
            <Text> </Text>
            <Spinner />
            <Text color="yellow"> loading...</Text>
          </>
        )}
        {clearing && (
          <>
            <Text> </Text>
            <Spinner />
            <Text color="yellow"> clearing...</Text>
          </>
        )}
      </Box>

      {/* Confirmation dialog */}
      {confirmClear && (
        <Box marginBottom={1} borderStyle="round" borderColor="yellow" padding={1}>
          <Text>Clear all cached data? This cannot be undone. (y/n)</Text>
        </Box>
      )}

      {/* Message */}
      {message && (
        <Box marginBottom={1}>
          <Text color={message.type === 'success' ? 'green' : 'red'}>
            {message.type === 'success' ? '✓ ' : '✗ '}
            {message.text}
          </Text>
        </Box>
      )}

      {/* Stats */}
      {stats && (
        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Text dimColor>Cache Path: </Text>
            <Text>{stats.cachePath}</Text>
          </Box>
          <Box>
            <Text dimColor>Status: </Text>
            <Text color={stats.enabled ? 'green' : 'yellow'}>
              {stats.enabled ? 'Enabled' : 'Disabled'}
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Total Size: </Text>
            <Text bold color="cyan">
              {formatBytes(stats.totalSize)}
            </Text>
          </Box>
          <Box>
            <Text dimColor>Items: </Text>
            <Text bold>{stats.itemCount.toLocaleString()}</Text>
          </Box>
        </Box>
      )}

      {/* Empty state */}
      {stats && stats.itemCount === 0 && !message && (
        <Box marginBottom={1}>
          <Text color="gray">Cache is empty</Text>
        </Box>
      )}

      {/* Actions */}
      {stats && stats.itemCount > 0 && !confirmClear && (
        <Box marginBottom={1} marginTop={1}>
          <Box borderStyle="round" borderColor="red" paddingX={2} paddingY={0} marginRight={2}>
            <Text color="red">c</Text>
            <Text> Clear Cache</Text>
          </Box>
          <Box borderStyle="round" borderColor="gray" paddingX={2} paddingY={0}>
            <Text color="gray">r</Text>
            <Text> Refresh</Text>
          </Box>
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>c: clear cache | r: refresh | q: quit</Text>
      </Box>
    </Box>
  );
}
