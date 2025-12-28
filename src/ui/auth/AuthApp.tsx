/**
 * AuthApp - Interactive UI for authentication.
 *
 * Shows login progress, team selection, and success/error states.
 */

import { useEffect, useState } from 'react';

import { Box, Text, useApp, useInput } from 'ink';

export type AuthPhase = 'idle' | 'logging_in' | 'selecting_team' | 'success' | 'error';

export interface TeamInfo {
  id: string;
  name: string;
  slug: string;
}

export interface UserInfo {
  email: string;
  organization: string;
  team?: string;
  appUrl: string;
}

export interface AuthProgress {
  phase: AuthPhase;
  /** User info when logged in */
  userInfo?: UserInfo;
  /** Available teams for selection */
  teams?: TeamInfo[];
  /** Selected team index */
  selectedTeamIndex?: number;
  /** Error message if failed */
  error?: string;
  /** Status message */
  statusMessage?: string;
}

export interface AuthAppProps {
  /** Initial phase */
  initialPhase?: AuthPhase;
  /** Called when a team is selected */
  onTeamSelect?: (team: TeamInfo) => void;
  /** Called when auth completes successfully */
  onComplete?: (userInfo: UserInfo) => void;
  /** Called when auth fails */
  onError?: (error: string) => void;
  /** Called when user exits */
  onExit?: () => void;
}

function Spinner() {
  const [frame, setFrame] = useState(0);
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((prev) => (prev + 1) % frames.length);
    }, 80);
    return () => clearInterval(interval);
  }, []);

  return <Text color="cyan">{frames[frame]}</Text>;
}

function TeamSelector({
  teams,
  selectedIndex,
  onSelect,
}: {
  teams: TeamInfo[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  useInput((_input, key) => {
    if (key.upArrow) {
      onSelect(selectedIndex > 0 ? selectedIndex - 1 : teams.length - 1);
    } else if (key.downArrow) {
      onSelect(selectedIndex < teams.length - 1 ? selectedIndex + 1 : 0);
    }
  });

  return (
    <Box flexDirection="column">
      {teams.map((team, index) => {
        const isSelected = index === selectedIndex;
        return (
          <Box key={team.id}>
            <Text color={isSelected ? 'cyan' : undefined}>
              {isSelected ? '❯ ' : '  '}
              {team.name}
            </Text>
            <Text dimColor> ({team.slug})</Text>
          </Box>
        );
      })}
    </Box>
  );
}

export function AuthApp({
  initialPhase = 'idle',
  onTeamSelect,
  onComplete,
  onError: _onError,
  onExit,
}: AuthAppProps) {
  const { exit } = useApp();
  const [progress, setProgress] = useState<AuthProgress>({
    phase: initialPhase,
    selectedTeamIndex: 0,
  });

  // Handle keyboard input
  useInput((input, key) => {
    if (progress.phase === 'selecting_team' && progress.teams) {
      if (key.return) {
        const selectedTeam = progress.teams[progress.selectedTeamIndex || 0];
        onTeamSelect?.(selectedTeam);
      } else if (key.escape) {
        // Select first team as default
        const defaultTeam = progress.teams[0];
        onTeamSelect?.(defaultTeam);
      }
      return;
    }

    if (progress.phase === 'success' || progress.phase === 'error') {
      if (key.return || key.escape || input === 'q') {
        if (progress.phase === 'success' && progress.userInfo) {
          onComplete?.(progress.userInfo);
        }
        onExit?.();
        exit();
      }
    }
  });

  // Expose update function for external control
  useEffect(() => {
    (globalThis as any).__authSetProgress = setProgress;
    return () => {
      delete (globalThis as any).__authSetProgress;
    };
  }, []);

  const phaseMessages: Record<AuthPhase, string> = {
    idle: 'Ready to authenticate',
    logging_in: 'Logging in...',
    selecting_team: 'Select a team',
    success: 'Successfully logged in!',
    error: 'Authentication failed',
  };

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Promptfoo Authentication
        </Text>
      </Box>

      {/* Logging in */}
      {progress.phase === 'logging_in' && (
        <Box marginBottom={1}>
          <Box marginRight={2}>
            <Spinner />
          </Box>
          <Text>{progress.statusMessage || phaseMessages.logging_in}</Text>
        </Box>
      )}

      {/* Team Selection */}
      {progress.phase === 'selecting_team' && progress.teams && (
        <Box flexDirection="column" marginBottom={1}>
          <Box marginBottom={1}>
            <Text>{phaseMessages.selecting_team}</Text>
          </Box>
          <TeamSelector
            teams={progress.teams}
            selectedIndex={progress.selectedTeamIndex || 0}
            onSelect={(index) => setProgress((prev) => ({ ...prev, selectedTeamIndex: index }))}
          />
        </Box>
      )}

      {/* Success */}
      {progress.phase === 'success' && progress.userInfo && (
        <Box flexDirection="column" marginBottom={1}>
          <Box marginBottom={1}>
            <Text color="green" bold>
              ✓ {phaseMessages.success}
            </Text>
          </Box>
          <Box flexDirection="column">
            <Box>
              <Text dimColor>User: </Text>
              <Text color="cyan">{progress.userInfo.email}</Text>
            </Box>
            <Box>
              <Text dimColor>Organization: </Text>
              <Text color="cyan">{progress.userInfo.organization}</Text>
            </Box>
            {progress.userInfo.team && (
              <Box>
                <Text dimColor>Team: </Text>
                <Text color="cyan">{progress.userInfo.team}</Text>
              </Box>
            )}
            <Box>
              <Text dimColor>App: </Text>
              <Text color="cyan">{progress.userInfo.appUrl}</Text>
            </Box>
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

      {/* Footer */}
      <Box marginTop={1}>
        {progress.phase === 'logging_in' && <Text dimColor>Please wait...</Text>}
        {progress.phase === 'selecting_team' && (
          <Text dimColor>↑/↓ to navigate, Enter to select, Esc to use default</Text>
        )}
        {(progress.phase === 'success' || progress.phase === 'error') && (
          <Text dimColor>Press Enter to exit</Text>
        )}
      </Box>
    </Box>
  );
}

export interface AuthController {
  setPhase(phase: AuthPhase): void;
  setStatusMessage(message: string): void;
  showTeamSelector(teams: TeamInfo[]): void;
  complete(userInfo: UserInfo): void;
  error(message: string): void;
}

export function createAuthController(): AuthController {
  const getSetProgress = () => (globalThis as any).__authSetProgress;

  return {
    setPhase(phase) {
      getSetProgress()?.((prev: AuthProgress) => ({ ...prev, phase }));
    },

    setStatusMessage(message) {
      getSetProgress()?.((prev: AuthProgress) => ({ ...prev, statusMessage: message }));
    },

    showTeamSelector(teams) {
      getSetProgress()?.((prev: AuthProgress) => ({
        ...prev,
        phase: 'selecting_team',
        teams,
        selectedTeamIndex: 0,
      }));
    },

    complete(userInfo) {
      getSetProgress()?.((prev: AuthProgress) => ({
        ...prev,
        phase: 'success',
        userInfo,
      }));
    },

    error(message) {
      getSetProgress()?.((prev: AuthProgress) => ({
        ...prev,
        phase: 'error',
        error: message,
      }));
    },
  };
}
