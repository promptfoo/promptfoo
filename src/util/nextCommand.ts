// src/util/nextCommand.ts
// Detect how the CLI was invoked so we can show the right "Next:" command.
export function detectInstaller(): 'npx' | 'brew' | 'npm-global' | 'unknown' {
  const prefix = process.env.npm_config_prefix || '';
  const ua = process.env.npm_config_user_agent || '';
  const exec = process.execPath || '';

  // Homebrew path or exec location
  if (/Homebrew\/Cellar/i.test(prefix) || /Homebrew|Cellar/i.test(exec)) {
    return 'brew';
  }

  // UA fallback so we can simulate NPX locally:
  // npm_config_user_agent='npx/...' node dist/src/main.js init
  if (/\bnpx\/\d+/i.test(ua)) {
    return 'npx';
  }
  if (/\bnpm\/\d+/i.test(ua)) {
    return 'npm-global';
  }

  return 'unknown';
}

export function nextCmd(sub: string, opts?: { versionTag?: string }): string {
  const version = opts?.versionTag ?? 'latest';

  switch (detectInstaller()) {
    case 'npx': {
      return `npx promptfoo@${version} ${sub}`;
    }
    case 'brew': {
      return `promptfoo ${sub}`;
    }
    case 'npm-global': {
      return `promptfoo ${sub}`;
    }
    default: {
      return `promptfoo ${sub}`;
    }
  }
}
