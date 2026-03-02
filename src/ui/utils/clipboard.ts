/**
 * Cross-platform clipboard utility for the Ink UI.
 *
 * Uses native system commands for clipboard access to avoid
 * additional dependencies. All operations are async to avoid
 * blocking the event loop.
 */

import { execSync, spawn } from 'child_process';

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

/** Maximum text size for clipboard operations (10MB) */
const MAX_CLIPBOARD_SIZE = 10 * 1024 * 1024;

/** Timeout for clipboard operations in milliseconds */
const CLIPBOARD_TIMEOUT_MS = 5000;

/**
 * Copy text to the system clipboard asynchronously.
 *
 * Uses spawn instead of execSync to avoid blocking the event loop,
 * which keeps the UI responsive during clipboard operations.
 * Includes timeout protection to prevent hanging on unresponsive commands.
 */
export async function copyToClipboard(text: string): Promise<ClipboardResult> {
  // Check text size before attempting clipboard operation
  if (text.length > MAX_CLIPBOARD_SIZE) {
    return {
      success: false,
      error: `Text too large for clipboard (${(text.length / 1024 / 1024).toFixed(1)}MB, max ${MAX_CLIPBOARD_SIZE / 1024 / 1024}MB)`,
    };
  }

  const clipboardCmd = getClipboardCommand();

  if (!clipboardCmd) {
    return {
      success: false,
      error: 'Clipboard not available on this platform',
    };
  }

  const tryClipboardCommand = (command: string, args: string[]): Promise<ClipboardResult> => {
    return new Promise((resolve) => {
      let resolved = false;
      let timeoutHandle: NodeJS.Timeout | null = null;

      const proc = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let errorOutput = '';

      // Set up timeout
      timeoutHandle = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          proc.kill('SIGTERM');
          resolve({
            success: false,
            error: `Clipboard operation timed out after ${CLIPBOARD_TIMEOUT_MS / 1000}s`,
          });
        }
      }, CLIPBOARD_TIMEOUT_MS);

      const cleanup = () => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }
      };

      proc.stderr?.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });

      proc.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve({
            success: false,
            error: err.message,
          });
        }
      });

      proc.on('close', (code) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          if (code === 0) {
            resolve({ success: true });
          } else {
            resolve({
              success: false,
              error: errorOutput || `Process exited with code ${code}`,
            });
          }
        }
      });

      // Write text to stdin and close it
      proc.stdin?.write(text);
      proc.stdin?.end();
    });
  };

  const { command, args } = clipboardCmd;
  const result = await tryClipboardCommand(command, args);

  // Try xsel as fallback on Linux if xclip failed
  if (!result.success && process.platform === 'linux') {
    const fallbackResult = await tryClipboardCommand('xsel', ['--clipboard', '--input']);
    if (fallbackResult.success) {
      return fallbackResult;
    }
  }

  return result;
}

/**
 * Check if clipboard is available on this platform.
 *
 * Note: This is intentionally synchronous since it's typically called
 * once at startup to determine UI capabilities. The actual copy
 * operation is async to avoid blocking during user interaction.
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
