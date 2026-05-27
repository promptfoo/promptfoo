import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildReconExclusions,
  isReconPathExcluded,
  prepareReconTarget,
} from '../../../../src/redteam/commands/recon/target';

describe('recon target preparation', () => {
  let tempDir: string;
  let sourceDir: string;
  let scratchpadDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-recon-target-test-'));
    sourceDir = path.join(tempDir, 'source');
    scratchpadDir = path.join(tempDir, 'scratchpad');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(scratchpadDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('matches default and custom exclusions across the tree', () => {
    const exclusions = buildReconExclusions(['fixtures/**', '*.secret.ts']);

    expect(isReconPathExcluded('.env', exclusions)).toBe(true);
    expect(isReconPathExcluded('nested/.env.local', exclusions)).toBe(true);
    expect(isReconPathExcluded('.npmrc', exclusions)).toBe(true);
    expect(isReconPathExcluded('packages/app/.npmrc', exclusions)).toBe(true);
    expect(isReconPathExcluded('.docker/config.json', exclusions)).toBe(true);
    expect(isReconPathExcluded('home/.aws/credentials', exclusions)).toBe(true);
    expect(isReconPathExcluded('home/.ssh/config', exclusions)).toBe(true);
    expect(isReconPathExcluded('secrets/id_ed25519', exclusions)).toBe(true);
    expect(isReconPathExcluded('certs/prod.pem', exclusions)).toBe(true);
    expect(isReconPathExcluded('certs/prod.p12', exclusions)).toBe(true);
    expect(isReconPathExcluded('node_modules/pkg/index.js', exclusions)).toBe(true);
    expect(isReconPathExcluded('src/node_modules/pkg/index.js', exclusions)).toBe(true);
    expect(isReconPathExcluded('fixtures/sample.json', exclusions)).toBe(true);
    expect(isReconPathExcluded('src/private.secret.ts', exclusions)).toBe(true);
    expect(isReconPathExcluded('src/app.ts', exclusions)).toBe(false);
  });

  it('copies only non-excluded regular files into an isolated snapshot', () => {
    fs.writeFileSync(path.join(sourceDir, 'README.md'), 'allowed docs');
    fs.writeFileSync(path.join(sourceDir, '.env'), 'OPENAI_API_KEY=secret');
    fs.writeFileSync(path.join(sourceDir, '.npmrc'), '//registry.npmjs.org/:_authToken=secret');
    fs.mkdirSync(path.join(sourceDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'src', 'app.ts'), 'export const app = true;');
    fs.writeFileSync(path.join(sourceDir, 'src', '.env.local'), 'SECRET=value');
    fs.mkdirSync(path.join(sourceDir, '.aws'), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, '.aws', 'credentials'), 'aws_secret_access_key=secret');
    fs.mkdirSync(path.join(sourceDir, 'fixtures'), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'fixtures', 'example.json'), '{}');

    const target = prepareReconTarget(sourceDir, scratchpadDir, ['fixtures/**']);

    expect(fs.readFileSync(path.join(target.directory, 'README.md'), 'utf8')).toBe('allowed docs');
    expect(fs.readFileSync(path.join(target.directory, 'src', 'app.ts'), 'utf8')).toContain(
      'app = true',
    );
    expect(fs.existsSync(path.join(target.directory, '.env'))).toBe(false);
    expect(fs.existsSync(path.join(target.directory, '.npmrc'))).toBe(false);
    expect(fs.existsSync(path.join(target.directory, 'src', '.env.local'))).toBe(false);
    expect(fs.existsSync(path.join(target.directory, '.aws', 'credentials'))).toBe(false);
    expect(fs.existsSync(path.join(target.directory, 'fixtures', 'example.json'))).toBe(false);
    expect(target.copiedFiles).toBe(2);
    expect(target.skippedEntries).toBeGreaterThanOrEqual(5);
  });

  it('resolves absolute custom exclusions relative to the scanned root', () => {
    const secretsDir = path.join(sourceDir, 'secrets');
    fs.mkdirSync(secretsDir, { recursive: true });
    fs.writeFileSync(path.join(secretsDir, 'credential.txt'), 'SECRET_SENTINEL');
    fs.writeFileSync(path.join(sourceDir, 'README.md'), 'allowed docs');

    const target = prepareReconTarget(sourceDir, scratchpadDir, [secretsDir]);

    expect(target.excludedPatterns).toContain('secrets');
    expect(fs.existsSync(path.join(target.directory, 'secrets', 'credential.txt'))).toBe(false);
    expect(fs.readFileSync(path.join(target.directory, 'README.md'), 'utf8')).toBe('allowed docs');
  });

  it('skips the scratchpad when scanning a parent directory of the scratchpad', () => {
    fs.writeFileSync(path.join(sourceDir, 'README.md'), 'allowed docs');
    const nestedScratchpadDir = path.join(sourceDir, 'promptfoo-recon-scratchpad');
    fs.mkdirSync(path.join(nestedScratchpadDir, 'target'), { recursive: true });
    fs.writeFileSync(path.join(nestedScratchpadDir, 'notes.md'), 'temporary notes');
    fs.writeFileSync(path.join(nestedScratchpadDir, 'target', 'recursive.txt'), 'do not copy');

    const target = prepareReconTarget(sourceDir, nestedScratchpadDir);

    expect(fs.readFileSync(path.join(target.directory, 'README.md'), 'utf8')).toBe('allowed docs');
    expect(fs.existsSync(path.join(target.directory, 'promptfoo-recon-scratchpad'))).toBe(false);
    expect(target.copiedFiles).toBe(1);
    expect(target.skippedEntries).toBeGreaterThanOrEqual(1);
  });
});
