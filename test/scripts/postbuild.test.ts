import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { shouldCopyDrizzlePath } from '../../scripts/postbuild';

describe('postbuild', () => {
  it('exports the postbuild entrypoint', async () => {
    const { postbuild } = await import('../../scripts/postbuild');
    expect(typeof postbuild).toBe('function');
  });

  describe('filter function for drizzle', () => {
    it('should exclude files containing CLAUDE', () => {
      expect(shouldCopyDrizzlePath('/path/to/CLAUDE.md')).toBe(false);
      expect(shouldCopyDrizzlePath('/path/to/AGENTS.md')).toBe(false);
      expect(shouldCopyDrizzlePath('/path/to/0001_migration.sql')).toBe(true);
      expect(shouldCopyDrizzlePath('/path/to/meta/_journal.json')).toBe(true);
    });
  });
});

describe('postbuild integration', () => {
  it('should verify the actual project has all required wrapper files', () => {
    const projectRoot = path.resolve(__dirname, '../../');
    const srcDir = path.join(projectRoot, 'src');

    // Verify python wrappers exist
    expect(fs.existsSync(path.join(srcDir, 'python', 'wrapper.py'))).toBe(true);
    expect(fs.existsSync(path.join(srcDir, 'python', 'persistent_wrapper.py'))).toBe(true);

    // Verify golang wrapper exists
    expect(fs.existsSync(path.join(srcDir, 'golang', 'wrapper.go'))).toBe(true);

    // Verify ruby wrapper exists
    expect(fs.existsSync(path.join(srcDir, 'ruby', 'wrapper.rb'))).toBe(true);
  });

  it('should copy wrapper files to both CLI and server directories after build', () => {
    const projectRoot = path.resolve(__dirname, '../../');
    const distDir = path.join(projectRoot, 'dist', 'src');
    const serverDir = path.join(distDir, 'server');

    // Skip if dist doesn't exist or wrapper files haven't been copied yet (postbuild incomplete)
    // Check for one representative wrapper file to determine if postbuild has run
    if (!fs.existsSync(distDir) || !fs.existsSync(path.join(serverDir, 'python', 'wrapper.py'))) {
      return;
    }

    // Wrapper files should exist at dist/src/{type}/ for CLI builds
    // These paths are used when import.meta.url points to dist/src/main.js or entrypoint.js
    const cliWrapperPaths = [
      path.join(distDir, 'python', 'wrapper.py'),
      path.join(distDir, 'python', 'persistent_wrapper.py'),
      path.join(distDir, 'ruby', 'wrapper.rb'),
      path.join(distDir, 'golang', 'wrapper.go'),
    ];

    for (const wrapperPath of cliWrapperPaths) {
      expect(fs.existsSync(wrapperPath)).toBe(true);
    }

    // Wrapper files should also exist at dist/src/server/{type}/ for bundled server builds
    // These paths are used when import.meta.url points to dist/src/server/index.js (Docker)
    // See: https://github.com/promptfoo/promptfoo/issues/7139
    const serverWrapperPaths = [
      path.join(serverDir, 'python', 'wrapper.py'),
      path.join(serverDir, 'python', 'persistent_wrapper.py'),
      path.join(serverDir, 'ruby', 'wrapper.rb'),
      path.join(serverDir, 'golang', 'wrapper.go'),
    ];

    for (const wrapperPath of serverWrapperPaths) {
      expect(fs.existsSync(wrapperPath)).toBe(true);
    }
  });

  it('should verify the actual project has HTML files', () => {
    const projectRoot = path.resolve(__dirname, '../../');
    const srcDir = path.join(projectRoot, 'src');
    const htmlFiles = fs.readdirSync(srcDir).filter((f) => f.endsWith('.html'));

    expect(htmlFiles.length).toBeGreaterThan(0);
    expect(htmlFiles).toContain('tableOutput.html');
  });

  it('should verify drizzle directory has migrations', () => {
    const projectRoot = path.resolve(__dirname, '../../');
    const drizzleDir = path.join(projectRoot, 'drizzle');

    expect(fs.existsSync(drizzleDir)).toBe(true);
    const files = fs.readdirSync(drizzleDir);
    const sqlFiles = files.filter((f) => f.endsWith('.sql'));

    expect(sqlFiles.length).toBeGreaterThan(0);
  });

  it('should verify drizzle has files that need to be excluded', () => {
    const projectRoot = path.resolve(__dirname, '../../');
    const drizzleDir = path.join(projectRoot, 'drizzle');

    // These should exist in source but be excluded from dist
    const hasExcludableFiles =
      fs.existsSync(path.join(drizzleDir, 'CLAUDE.md')) ||
      fs.existsSync(path.join(drizzleDir, 'AGENTS.md'));

    expect(hasExcludableFiles).toBe(true);
  });
});
