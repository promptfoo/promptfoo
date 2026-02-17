/**
 * Cross-platform postinstall script that installs the pre-commit git hook.
 *
 * Uses only Node.js built-ins — no dependencies required (runs during npm install
 * before any deps are available).
 *
 * Behaviour:
 *  - Skips silently when there is no `.git` directory (global installs, CI, etc.)
 *  - On Unix: creates a relative symlink; falls back to copy if symlink fails
 *  - On Windows: always copies (symlinks need admin privileges)
 *  - Never overwrites a non-promptfoo hook
 *  - Always safe to re-run (idempotent)
 *  - Never breaks `npm install` (top-level catch)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROMPTFOO_MARKER = '# Pre-commit hook for linting changed files';

/**
 * Install the pre-commit hook into the given project root.
 *
 * @param {string} rootDir - Absolute path to the project root (contains `.git/`)
 * @returns {{ installed: boolean, method?: string, error?: string }}
 */
export function installHook(rootDir) {
  const gitDir = path.join(rootDir, '.git');

  // Skip if no .git directory (global install, extracted tarball, etc.)
  // Also skips when .git is a file (git worktrees) — the hook belongs in the
  // main repo's .git/hooks/, not the worktree's, so we don't attempt it here.
  if (!fs.existsSync(gitDir) || !fs.statSync(gitDir).isDirectory()) {
    return { installed: false };
  }

  const sourceScript = path.join(rootDir, 'scripts', 'pre-commit');

  // Skip if the source hook script doesn't exist
  if (!fs.existsSync(sourceScript)) {
    return { installed: false };
  }

  const hooksDir = path.join(gitDir, 'hooks');
  const hookPath = path.join(hooksDir, 'pre-commit');

  // If a hook already exists, check whether it belongs to us
  if (fs.existsSync(hookPath)) {
    let existing;
    try {
      existing = fs.readFileSync(hookPath, 'utf-8');
    } catch {
      // Unreadable hook (e.g. binary) — leave it alone
      return { installed: false };
    }
    if (!existing.includes(PROMPTFOO_MARKER)) {
      // Not ours — don't touch it
      return { installed: false };
    }
  }

  // Ensure .git/hooks/ exists
  fs.mkdirSync(hooksDir, { recursive: true });

  const isWindows = os.platform() === 'win32';

  if (!isWindows) {
    // Unix: try a relative symlink first (mirrors the old `ln -sf` behaviour)
    try {
      // Remove any existing file so we can recreate the symlink
      if (fs.existsSync(hookPath)) {
        fs.unlinkSync(hookPath);
      }
      const relTarget = path.relative(hooksDir, sourceScript);
      fs.symlinkSync(relTarget, hookPath);
      return { installed: true, method: 'symlink' };
    } catch {
      // Fall through to copy
    }
  }

  // Windows or symlink failed: copy the file
  try {
    fs.copyFileSync(sourceScript, hookPath);
    // Ensure the hook is executable (no-op on Windows, harmless)
    fs.chmodSync(hookPath, 0o755);
    return { installed: true, method: 'copy' };
  } catch (err) {
    return { installed: false, error: String(err) };
  }
}

// --- CLI entry point ---
// Only runs when executed directly (not when imported by tests).
// Uses fileURLToPath() instead of new URL().pathname because the latter
// produces /C:/… on Windows, which doesn't match process.argv[1] (C:\…).
const scriptPath = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(scriptPath);

if (isDirectRun) {
  try {
    const root = path.resolve(path.dirname(scriptPath), '..');
    const result = installHook(root);
    if (result.installed) {
      console.log(
        `Pre-commit hook installed via ${result.method} (runs Biome + Prettier on staged files). Set DISABLE_PRECOMMIT_LINT=1 in .env to skip.`,
      );
    }
  } catch {
    // Postinstall scripts must never break npm install
  }
}
