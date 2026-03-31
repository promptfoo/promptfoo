import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_VERSION = [11, 11, 0];
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const gitMarker = join(repoRoot, '.git');
const userAgent = process.env.npm_config_user_agent ?? '';

const parseVersion = (value) => {
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    return null;
  }
  return match.slice(1).map((part) => Number.parseInt(part, 10));
};

const compareVersions = (left, right) => {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }
  return 0;
};

// Skip package consumers; this check is only for source checkouts.
if (!existsSync(gitMarker)) {
  process.exit(0);
}

// pnpm and yarn have their own release-age handling; only gate npm here.
const npmMatch = userAgent.match(/\bnpm\/(\d+\.\d+\.\d+)\b/);
if (!npmMatch) {
  process.exit(0);
}

const npmVersion = parseVersion(npmMatch[1]);
if (!npmVersion || compareVersions(npmVersion, REQUIRED_VERSION) >= 0) {
  process.exit(0);
}

console.error(
  'This repository requires npm >= 11.11.0 for source installs so the npm release-age policy is enforced consistently.',
);
console.error(
  'After `nvm use`, run `npm install -g npm@11` and then retry `npm install` or `npm ci`.',
);
process.exit(1);
