/**
 * RedteamGenerateApp - Interactive UI for redteam test case generation.
 *
 * Shows real-time progress as plugins generate adversarial test cases.
 */

import { useEffect, useMemo, useState } from 'react';
import type React from 'react';

import { Box, Text, useApp, useInput } from 'ink';

// Type-safe global state for redteam generate UI controller communication
interface RedteamGenerateGlobal {
  __redteamGenerateSetProgress?: React.Dispatch<React.SetStateAction<GenerateProgress>>;
}
const redteamGenerateGlobal = globalThis as typeof globalThis & RedteamGenerateGlobal;

export interface PluginProgress {
  id: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  requested: number;
  generated: number;
  error?: string;
}

export interface StrategyProgress {
  id: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  requested: number;
  generated: number;
}

export interface GenerateProgress {
  phase: 'init' | 'purpose' | 'entities' | 'plugins' | 'strategies' | 'complete' | 'error';
  plugins: PluginProgress[];
  strategies: StrategyProgress[];
  totalTests: number;
  generatedTests: number;
  purpose?: string;
  entities?: string[];
  error?: string;
  startTime: number;
  endTime?: number;
}

export interface RedteamGenerateAppProps {
  /** Called when generation is complete */
  onComplete?: (result: { testsGenerated: number; outputPath?: string }) => void;
  /** Called when user cancels */
  onCancel?: () => void;
}

function ProgressBar({
  current,
  total,
  width = 30,
}: {
  current: number;
  total: number;
  width?: number;
}) {
  const percentage = total > 0 ? Math.min(1, current / total) : 0;
  const filled = Math.round(percentage * width);
  const empty = width - filled;

  return (
    <Text>
      <Text color="green">{'█'.repeat(filled)}</Text>
      <Text color="gray">{'░'.repeat(empty)}</Text>
      <Text> {Math.round(percentage * 100)}%</Text>
    </Text>
  );
}

function PluginRow({ plugin }: { plugin: PluginProgress }) {
  const statusIcon = {
    pending: <Text color="gray">○</Text>,
    running: <Text color="yellow">◐</Text>,
    complete: <Text color="green">✓</Text>,
    error: <Text color="red">✗</Text>,
  }[plugin.status];

  const statusColor = {
    pending: 'gray',
    running: 'yellow',
    complete: 'green',
    error: 'red',
  }[plugin.status] as 'gray' | 'yellow' | 'green' | 'red';

  return (
    <Box>
      <Box width={3}>{statusIcon}</Box>
      <Box width={25}>
        <Text color={statusColor}>{plugin.id}</Text>
      </Box>
      <Box width={15}>
        <Text>
          {plugin.generated}/{plugin.requested}
        </Text>
      </Box>
      {plugin.error && (
        <Text color="red" dimColor>
          {plugin.error}
        </Text>
      )}
    </Box>
  );
}

function StrategyRow({ strategy }: { strategy: StrategyProgress }) {
  const statusIcon = {
    pending: <Text color="gray">○</Text>,
    running: <Text color="yellow">◐</Text>,
    complete: <Text color="green">✓</Text>,
    error: <Text color="red">✗</Text>,
  }[strategy.status];

  const statusColor = {
    pending: 'gray',
    running: 'yellow',
    complete: 'green',
    error: 'red',
  }[strategy.status] as 'gray' | 'yellow' | 'green' | 'red';

  return (
    <Box>
      <Box width={3}>{statusIcon}</Box>
      <Box width={25}>
        <Text color={statusColor}>{strategy.id}</Text>
      </Box>
      <Box width={15}>
        <Text>
          {strategy.generated}/{strategy.requested}
        </Text>
      </Box>
    </Box>
  );
}

function ElapsedTime({ startTime, endTime }: { startTime: number; endTime?: number }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (endTime) {
      return;
    }
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [endTime]);

  const elapsed = Math.floor(((endTime || now) - startTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  return (
    <Text dimColor>
      {minutes}:{seconds.toString().padStart(2, '0')}
    </Text>
  );
}

export function RedteamGenerateApp({ onComplete: _onComplete, onCancel }: RedteamGenerateAppProps) {
  const { exit } = useApp();
  const [progress, setProgress] = useState<GenerateProgress>({
    phase: 'init',
    plugins: [],
    strategies: [],
    totalTests: 0,
    generatedTests: 0,
    startTime: Date.now(),
  });

  // Handle keyboard shortcuts
  useInput((input, key) => {
    if (input === 'c' && key.ctrl) {
      onCancel?.();
      exit();
    }
    if (input === 'q' && progress.phase === 'complete') {
      exit();
    }
  });

  // Calculate stats
  const stats = useMemo(() => {
    const completedPlugins = progress.plugins.filter((p) => p.status === 'complete').length;
    const errorPlugins = progress.plugins.filter((p) => p.status === 'error').length;
    const completedStrategies = progress.strategies.filter((s) => s.status === 'complete').length;

    return {
      completedPlugins,
      totalPlugins: progress.plugins.length,
      errorPlugins,
      completedStrategies,
      totalStrategies: progress.strategies.length,
    };
  }, [progress]);

  // Expose update function for external control
  useEffect(() => {
    // This would be called by the controller
    redteamGenerateGlobal.__redteamGenerateSetProgress = setProgress;
    return () => {
      delete redteamGenerateGlobal.__redteamGenerateSetProgress;
    };
  }, []);

  const phaseLabels: Record<string, string> = {
    init: 'Initializing...',
    purpose: 'Extracting system purpose...',
    entities: 'Extracting entities...',
    plugins: 'Generating test cases...',
    strategies: 'Applying attack strategies...',
    complete: 'Generation complete!',
    error: 'Generation failed',
  };

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="red">
          promptfoo redteam generate
        </Text>
        <Text> </Text>
        <ElapsedTime startTime={progress.startTime} endTime={progress.endTime} />
      </Box>

      {/* Phase indicator */}
      <Box marginBottom={1}>
        <Text color={progress.phase === 'error' ? 'red' : 'cyan'}>
          {phaseLabels[progress.phase]}
        </Text>
      </Box>

      {/* Overall progress */}
      {progress.totalTests > 0 && (
        <Box marginBottom={1}>
          <Box marginRight={2}>
            <Text>Overall: </Text>
          </Box>
          <ProgressBar current={progress.generatedTests} total={progress.totalTests} />
          <Text>
            {' '}
            {progress.generatedTests}/{progress.totalTests} tests
          </Text>
        </Box>
      )}

      {/* Purpose and entities */}
      {progress.purpose && (
        <Box marginBottom={1}>
          <Text dimColor>Purpose: </Text>
          <Text>{progress.purpose.slice(0, 60)}...</Text>
        </Box>
      )}

      {/* Plugins section */}
      {progress.plugins.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Box marginBottom={1}>
            <Text bold>
              Plugins ({stats.completedPlugins}/{stats.totalPlugins})
            </Text>
            {stats.errorPlugins > 0 && <Text color="red"> ({stats.errorPlugins} errors)</Text>}
          </Box>
          <Box flexDirection="column" marginLeft={2}>
            {progress.plugins.map((plugin) => (
              <PluginRow key={plugin.id} plugin={plugin} />
            ))}
          </Box>
        </Box>
      )}

      {/* Strategies section */}
      {progress.strategies.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Box marginBottom={1}>
            <Text bold>
              Strategies ({stats.completedStrategies}/{stats.totalStrategies})
            </Text>
          </Box>
          <Box flexDirection="column" marginLeft={2}>
            {progress.strategies.map((strategy) => (
              <StrategyRow key={strategy.id} strategy={strategy} />
            ))}
          </Box>
        </Box>
      )}

      {/* Error message */}
      {progress.error && (
        <Box marginTop={1}>
          <Text color="red">{progress.error}</Text>
        </Box>
      )}

      {/* Completion message */}
      {progress.phase === 'complete' && (
        <Box marginTop={1} flexDirection="column">
          <Text color="green" bold>
            ✓ Generated {progress.generatedTests} test cases
          </Text>
          <Box marginTop={1}>
            <Text dimColor>Press q to exit</Text>
          </Box>
        </Box>
      )}

      {/* Footer */}
      {progress.phase !== 'complete' && progress.phase !== 'error' && (
        <Box marginTop={1}>
          <Text dimColor>Press Ctrl+C to cancel</Text>
        </Box>
      )}
    </Box>
  );
}

export interface RedteamGenerateController {
  init(plugins: string[], strategies: string[], totalTests: number): void;
  setPurpose(purpose: string): void;
  setEntities(entities: string[]): void;
  startPlugins(): void;
  updatePlugin(id: string, update: Partial<PluginProgress>): void;
  startStrategies(): void;
  updateStrategy(id: string, update: Partial<StrategyProgress>): void;
  complete(generatedTests: number): void;
  error(message: string): void;
}

export function createRedteamGenerateController(): RedteamGenerateController {
  const getSetProgress = () => redteamGenerateGlobal.__redteamGenerateSetProgress;

  return {
    init(plugins, strategies, totalTests) {
      getSetProgress()?.((prev: GenerateProgress) => ({
        ...prev,
        phase: 'init',
        plugins: plugins.map((id) => ({
          id,
          status: 'pending' as const,
          requested: 0,
          generated: 0,
        })),
        strategies: strategies.map((id) => ({
          id,
          status: 'pending' as const,
          requested: 0,
          generated: 0,
        })),
        totalTests,
      }));
    },

    setPurpose(purpose) {
      getSetProgress()?.((prev: GenerateProgress) => ({
        ...prev,
        phase: 'purpose',
        purpose,
      }));
    },

    setEntities(entities) {
      getSetProgress()?.((prev: GenerateProgress) => ({
        ...prev,
        phase: 'entities',
        entities,
      }));
    },

    startPlugins() {
      getSetProgress()?.((prev: GenerateProgress) => ({
        ...prev,
        phase: 'plugins',
      }));
    },

    updatePlugin(id, update) {
      getSetProgress()?.((prev: GenerateProgress) => {
        const plugins = prev.plugins.map((p) => (p.id === id ? { ...p, ...update } : p));
        const generatedTests = plugins.reduce((sum, p) => sum + p.generated, 0);
        return { ...prev, plugins, generatedTests };
      });
    },

    startStrategies() {
      getSetProgress()?.((prev: GenerateProgress) => ({
        ...prev,
        phase: 'strategies',
      }));
    },

    updateStrategy(id, update) {
      getSetProgress()?.((prev: GenerateProgress) => {
        const strategies = prev.strategies.map((s) => (s.id === id ? { ...s, ...update } : s));
        const strategyTests = strategies.reduce((sum, s) => sum + s.generated, 0);
        const pluginTests = prev.plugins.reduce((sum, p) => sum + p.generated, 0);
        return { ...prev, strategies, generatedTests: pluginTests + strategyTests };
      });
    },

    complete(generatedTests) {
      getSetProgress()?.((prev: GenerateProgress) => ({
        ...prev,
        phase: 'complete',
        generatedTests,
        endTime: Date.now(),
      }));
    },

    error(message) {
      getSetProgress()?.((prev: GenerateProgress) => ({
        ...prev,
        phase: 'error',
        error: message,
        endTime: Date.now(),
      }));
    },
  };
}
