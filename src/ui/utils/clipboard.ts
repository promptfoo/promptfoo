/**
 * Cross-platform clipboard utility for the Ink UI.
 *
 * Uses native system commands for clipboard access to avoid
 * additional dependencies.
 */

import { execSync } from 'child_process';

export interface ClipboardResult {
  success: boolean;
  error?: string;
}

/**
 * Detect the current platform and return the appropriate clipboard command.
 */
function getClipboardCommand(): { command: string; args: string[] } | null {
  const platform = process.platform;

  switch (platform) {
    case 'darwin':
      // macOS
      return { command: 'pbcopy', args: [] };
    case 'win32':
      // Windows
      return { command: 'clip', args: [] };
    case 'linux':
      // Linux - try xclip first, fall back to xsel
      // Check if we have a display (X11/Wayland)
      if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) {
        return { command: 'xclip', args: ['-selection', 'clipboard'] };
      }
      return null;
    default:
      return null;
  }
}

/**
 * Copy text to the system clipboard.
 */
export function copyToClipboard(text: string): ClipboardResult {
  const clipboardCmd = getClipboardCommand();

  if (!clipboardCmd) {
    return {
      success: false,
      error: 'Clipboard not available on this platform',
    };
  }

  try {
    const { command, args } = clipboardCmd;
    const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command;

    // Use execSync with input to pipe text to clipboard command
    execSync(fullCommand, {
      input: text,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return { success: true };
  } catch (error) {
    // Try xsel as fallback on Linux
    if (process.platform === 'linux') {
      try {
        execSync('xsel --clipboard --input', {
          input: text,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        return { success: true };
      } catch {
        // xsel also failed
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to copy to clipboard',
    };
  }
}

/**
 * Check if clipboard is available on this platform.
 */
export function isClipboardAvailable(): boolean {
  const clipboardCmd = getClipboardCommand();
  if (!clipboardCmd) {
    return false;
  }

  try {
    // Test if the command exists
    const { command } = clipboardCmd;
    if (process.platform === 'win32') {
      execSync(`where ${command}`, { stdio: 'pipe' });
    } else {
      execSync(`which ${command}`, { stdio: 'pipe' });
    }
    return true;
  } catch {
    // Command not found, try fallback on Linux
    if (process.platform === 'linux') {
      try {
        execSync('which xsel', { stdio: 'pipe' });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}
