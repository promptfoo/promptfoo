// src/util/nextCommand.ts
import { isRunningUnderNpx } from './index';

export type Installer = 'npx' | 'npm-global' | 'brew' | 'unknown';

export function detectInstaller(): Installer {
  // Canonical: reuse repo’s detector
  if (isRunningUnderNpx()) return 'npx';

  // UA fallback so you can simulate NPX during local testing
  const ua = process.env.npm_config_user_agent || '';
  if (/\bnpx\b/i.test(ua)) return 'npx';

  // Heuristics for brew/global installs
  const prefix = process.env.npm_config_prefix || '';
  const exec   = process.execPath || '';
  if (/Homebrew|Cellar/i.test(prefix) || /Homebrew|Cellar/i.test(exec)) return 'brew';
  if (/\bnpm\/\d+/i.test(ua)) return 'npm-global';

  return 'unknown';
}

export function nextCmd(sub: string, opts?: { versionTag?: string }): string {
  const version = opts?.versionTag ?? 'latest';
  switch (detectInstaller()) {
    case 'npx':        return `npx promptfoo@${version} ${sub}`;
    case 'brew':
    case 'npm-global': return `promptfoo ${sub}`;
    default:           return `promptfoo ${sub}  # if using npx, run npx promptfoo@${version} ${sub}`;
  }
}
