/**
 * MenuApp - Interactive main menu for promptfoo CLI.
 *
 * Provides quick access to common commands with keyboard navigation.
 */

import { useState } from 'react';

import { Box, Text, useApp, useInput } from 'ink';
import { Spinner } from '../components/shared';

export interface AuthStatus {
  /** Whether the user is logged in */
  isLoggedIn: boolean;
  /** User email if logged in */
  email?: string;
  /** Organization name if logged in */
  organization?: string;
  /** Current team name if logged in */
  team?: string;
  /** App URL */
  appUrl?: string;
}

export interface MenuItem {
  /** Unique identifier */
  id: string;
  /** Display label */
  label: string;
  /** Description shown when selected */
  description: string;
  /** Keyboard shortcut */
  shortcut?: string;
  /** Category for grouping */
  category: 'quick' | 'auth' | 'tools' | 'settings';
  /** Whether this item requires auth */
  requiresAuth?: boolean;
  /** Whether to show this item when logged out */
  showWhenLoggedOut?: boolean;
}

export interface MenuAppProps {
  /** Current auth status */
  authStatus?: AuthStatus;
  /** Promptfoo version */
  version?: string;
  /** Called when menu item is selected */
  onSelect?: (item: MenuItem) => void;
  /** Called when user wants to exit */
  onExit?: () => void;
  /** Loading auth status */
  loading?: boolean;
}

const defaultMenuItems: MenuItem[] = [
  // Quick actions
  {
    id: 'eval',
    label: 'Run Evaluation',
    description: 'Run prompts against test cases',
    shortcut: 'e',
    category: 'quick',
  },
  {
    id: 'init',
    label: 'Initialize Project',
    description: 'Create a new promptfoo configuration',
    shortcut: 'i',
    category: 'quick',
  },
  {
    id: 'redteam',
    label: 'Red Team',
    description: 'Security testing for LLM applications',
    shortcut: 'r',
    category: 'quick',
  },
  {
    id: 'view',
    label: 'View Results',
    description: 'Open the web UI to view results',
    shortcut: 'v',
    category: 'quick',
  },
  // Auth actions
  {
    id: 'login',
    label: 'Login',
    description: 'Login to Promptfoo Cloud',
    shortcut: 'l',
    category: 'auth',
    showWhenLoggedOut: true,
  },
  {
    id: 'logout',
    label: 'Logout',
    description: 'Logout from Promptfoo Cloud',
    category: 'auth',
    requiresAuth: true,
  },
  {
    id: 'whoami',
    label: 'Who Am I',
    description: 'Show current user information',
    category: 'auth',
    requiresAuth: true,
  },
  {
    id: 'teams',
    label: 'Switch Team',
    description: 'Change your current team',
    category: 'auth',
    requiresAuth: true,
  },
  // Tools
  {
    id: 'share',
    label: 'Share Results',
    description: 'Create a shareable URL for evaluation results',
    shortcut: 's',
    category: 'tools',
    requiresAuth: true,
  },
  {
    id: 'list',
    label: 'List Resources',
    description: 'Browse evals, prompts, and datasets',
    category: 'tools',
  },
  {
    id: 'generate',
    label: 'Generate Dataset',
    description: 'Generate synthetic test data',
    category: 'tools',
  },
  // Settings
  {
    id: 'cache',
    label: 'Manage Cache',
    description: 'View and clear cached data',
    shortcut: 'c',
    category: 'settings',
  },
  {
    id: 'config',
    label: 'Configuration',
    description: 'View and edit settings',
    category: 'settings',
  },
];

function AuthStatusBar({ status, loading }: { status?: AuthStatus; loading?: boolean }) {
  if (loading) {
    return (
      <Box marginBottom={1} paddingX={1}>
        <Spinner />
        <Text color="gray"> Checking auth status...</Text>
      </Box>
    );
  }

  if (!status?.isLoggedIn) {
    return (
      <Box marginBottom={1} paddingX={1} borderStyle="round" borderColor="yellow">
        <Text color="yellow">Not logged in</Text>
        <Text color="gray"> - Press </Text>
        <Text color="cyan" bold>
          l
        </Text>
        <Text color="gray"> to login to Promptfoo Cloud</Text>
      </Box>
    );
  }

  return (
    <Box marginBottom={1} paddingX={1} borderStyle="round" borderColor="green">
      <Text color="green">Logged in as </Text>
      <Text color="cyan" bold>
        {status.email}
      </Text>
      {status.team && (
        <>
          <Text color="gray"> | Team: </Text>
          <Text color="white">{status.team}</Text>
        </>
      )}
    </Box>
  );
}

function MenuSection({
  title,
  items,
  selectedIndex,
  startIndex,
  authStatus,
}: {
  title: string;
  items: MenuItem[];
  selectedIndex: number;
  startIndex: number;
  authStatus?: AuthStatus;
}) {
  const filteredItems = items.filter((item) => {
    if (item.requiresAuth && !authStatus?.isLoggedIn) {
      return false;
    }
    if (item.showWhenLoggedOut === true && authStatus?.isLoggedIn) {
      return false;
    }
    return true;
  });

  if (filteredItems.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box marginBottom={0}>
        <Text color="gray" dimColor>
          {title}
        </Text>
      </Box>
      {filteredItems.map((item, _idx) => {
        const actualIndex =
          startIndex +
          items.slice(0, items.indexOf(item)).filter((i) => {
            if (i.requiresAuth && !authStatus?.isLoggedIn) {
              return false;
            }
            if (i.showWhenLoggedOut === true && authStatus?.isLoggedIn) {
              return false;
            }
            return true;
          }).length;
        const isSelected = selectedIndex === actualIndex;

        return (
          <Box key={item.id}>
            <Box width={3}>
              <Text color={isSelected ? 'cyan' : undefined}>{isSelected ? '▶' : ' '}</Text>
            </Box>
            {item.shortcut && (
              <Box width={4}>
                <Text color="yellow" bold>
                  [{item.shortcut}]
                </Text>
              </Box>
            )}
            {!item.shortcut && <Box width={4} />}
            <Box width={20}>
              <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
                {item.label}
              </Text>
            </Box>
            <Text color={isSelected ? 'white' : 'gray'}>{item.description}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

export function MenuApp({ authStatus, version, onSelect, onExit, loading }: MenuAppProps) {
  const { exit } = useApp();
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filter items based on auth status
  const visibleItems = defaultMenuItems.filter((item) => {
    if (item.requiresAuth && !authStatus?.isLoggedIn) {
      return false;
    }
    if (item.showWhenLoggedOut === true && authStatus?.isLoggedIn) {
      return false;
    }
    return true;
  });

  // Group items by category
  const quickItems = defaultMenuItems.filter((i) => i.category === 'quick');
  const authItems = defaultMenuItems.filter((i) => i.category === 'auth');
  const toolItems = defaultMenuItems.filter((i) => i.category === 'tools');
  const settingsItems = defaultMenuItems.filter((i) => i.category === 'settings');

  // Calculate start indices for each section
  const getVisibleCount = (items: MenuItem[]) =>
    items.filter((i) => {
      if (i.requiresAuth && !authStatus?.isLoggedIn) {
        return false;
      }
      if (i.showWhenLoggedOut === true && authStatus?.isLoggedIn) {
        return false;
      }
      return true;
    }).length;

  const quickStart = 0;
  const authStart = getVisibleCount(quickItems);
  const toolStart = authStart + getVisibleCount(authItems);
  const settingsStart = toolStart + getVisibleCount(toolItems);

  // Handle keyboard input
  useInput((input, key) => {
    // Navigation
    if (key.upArrow || input === 'k') {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex((prev) => Math.min(visibleItems.length - 1, prev + 1));
    }

    // Selection
    if (key.return && visibleItems[selectedIndex]) {
      onSelect?.(visibleItems[selectedIndex]);
    }

    // Shortcuts
    const shortcutItem = visibleItems.find(
      (item) => item.shortcut?.toLowerCase() === input.toLowerCase(),
    );
    if (shortcutItem) {
      onSelect?.(shortcutItem);
    }

    // Exit
    if (input === 'q' || key.escape) {
      onExit?.();
      exit();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="magenta">
          promptfoo
        </Text>
        {version && <Text color="gray"> v{version}</Text>}
        <Text color="gray"> - LLM Testing & Red Teaming</Text>
      </Box>

      {/* Auth Status */}
      <AuthStatusBar status={authStatus} loading={loading} />

      {/* Menu Sections */}
      <MenuSection
        title="Quick Actions"
        items={quickItems}
        selectedIndex={selectedIndex}
        startIndex={quickStart}
        authStatus={authStatus}
      />

      <MenuSection
        title="Authentication"
        items={authItems}
        selectedIndex={selectedIndex}
        startIndex={authStart}
        authStatus={authStatus}
      />

      <MenuSection
        title="Tools"
        items={toolItems}
        selectedIndex={selectedIndex}
        startIndex={toolStart}
        authStatus={authStatus}
      />

      <MenuSection
        title="Settings"
        items={settingsItems}
        selectedIndex={selectedIndex}
        startIndex={settingsStart}
        authStatus={authStatus}
      />

      {/* Footer */}
      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>
          ↑↓/jk: navigate | Enter: select | shortcuts: highlighted keys | q: quit
        </Text>
      </Box>

      {/* Help hint */}
      <Box marginTop={1}>
        <Text dimColor>
          Run <Text color="cyan">promptfoo --help</Text> for all available commands
        </Text>
      </Box>
    </Box>
  );
}

export { defaultMenuItems };
