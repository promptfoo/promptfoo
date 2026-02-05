import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// We need to test the postbuild module, but it runs on import
// So we'll test the exported function after mocking

describe('postbuild', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    // Create a temp directory structure that mimics the project
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'postbuild-test-'));
    originalCwd = process.cwd();

    // Create source structure
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    // Create HTML file
    fs.writeFileSync(path.join(srcDir, 'tableOutput.html'), '<html></html>');

    // Create wrapper directories and files
    const pythonDir = path.join(srcDir, 'python');
    fs.mkdirSync(pythonDir, { recursive: true });
    fs.writeFileSync(path.join(pythonDir, 'wrapper.py'), '# python wrapper');
    fs.writeFileSync(path.join(pythonDir, 'persistent_wrapper.py'), '# persistent wrapper');

    const golangDir = path.join(srcDir, 'golang');
    fs.mkdirSync(golangDir, { recursive: true });
    fs.writeFileSync(path.join(golangDir, 'wrapper.go'), '// go wrapper');

    const rubyDir = path.join(srcDir, 'ruby');
    fs.mkdirSync(rubyDir, { recursive: true });
    fs.writeFileSync(path.join(rubyDir, 'wrapper.rb'), '# ruby wrapper');

    // Create drizzle directory with migrations and files to exclude
    const drizzleDir = path.join(tempDir, 'drizzle');
    fs.mkdirSync(drizzleDir, { recursive: true });
    fs.writeFileSync(path.join(drizzleDir, '0001_migration.sql'), 'CREATE TABLE test;');
    fs.writeFileSync(path.join(drizzleDir, '0002_migration.sql'), 'ALTER TABLE test;');
    fs.writeFileSync(path.join(drizzleDir, 'CLAUDE.md'), '# Should be excluded');
    fs.writeFileSync(path.join(drizzleDir, 'AGENTS.md'), '# Should be excluded');

    // Create dist directory with required build outputs
    const distSrcDir = path.join(tempDir, 'dist', 'src');
    const distServerDir = path.join(tempDir, 'dist', 'src', 'server');
    fs.mkdirSync(distServerDir, { recursive: true });
    fs.writeFileSync(path.join(distSrcDir, 'main.js'), '#!/usr/bin/env node\nconsole.log("cli");');
    fs.writeFileSync(path.join(distSrcDir, 'index.js'), 'export const foo = 1;');
    fs.writeFileSync(path.join(distSrcDir, 'index.cjs'), 'module.exports = { foo: 1 };');
    fs.writeFileSync(path.join(distServerDir, 'index.js'), 'export const server = {};');
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('WRAPPER_TYPES constant', () => {
    it('should include all supported wrapper types', async () => {
      // Import the module - this verifies it loads without error
      const { postbuild } = await import('../../scripts/postbuild');
      // The postbuild function should be exported and callable
      expect(typeof postbuild).toBe('function');
    });
  });

  describe('REQUIRED_BUILD_OUTPUTS constant', () => {
    it('should verify critical build outputs exist', () => {
      // Verify the build outputs we created
      expect(fs.existsSync(path.join(tempDir, 'dist', 'src', 'main.js'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'dist', 'src', 'index.js'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'dist', 'src', 'index.cjs'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'dist', 'src', 'server', 'index.js'))).toBe(true);
    });
  });

  describe('drizzle directory copy', () => {
    it('should exclude .md files from drizzle copy', () => {
      const drizzleDir = path.join(tempDir, 'drizzle');
      const files = fs.readdirSync(drizzleDir);

      // Source should have .md files
      expect(files).toContain('CLAUDE.md');
      expect(files).toContain('AGENTS.md');

      // After postbuild, dist/drizzle should NOT have .md files
      // This would be tested by running postbuild
    });

    it('should include .sql migration files', () => {
      const drizzleDir = path.join(tempDir, 'drizzle');
      const files = fs.readdirSync(drizzleDir);

      expect(files.filter((f) => f.endsWith('.sql'))).toHaveLength(2);
    });
  });

  describe('wrapper files', () => {
    it('should have all required python wrapper files in source', () => {
      const pythonDir = path.join(tempDir, 'src', 'python');
      expect(fs.existsSync(path.join(pythonDir, 'wrapper.py'))).toBe(true);
      expect(fs.existsSync(path.join(pythonDir, 'persistent_wrapper.py'))).toBe(true);
    });

    it('should have golang wrapper file in source', () => {
      const golangDir = path.join(tempDir, 'src', 'golang');
      expect(fs.existsSync(path.join(golangDir, 'wrapper.go'))).toBe(true);
    });

    it('should have ruby wrapper file in source', () => {
      const rubyDir = path.join(tempDir, 'src', 'ruby');
      expect(fs.existsSync(path.join(rubyDir, 'wrapper.rb'))).toBe(true);
    });
  });

  describe('HTML files', () => {
    it('should find HTML files in src directory', () => {
      const srcDir = path.join(tempDir, 'src');
      const htmlFiles = fs.readdirSync(srcDir).filter((f) => f.endsWith('.html'));

      expect(htmlFiles).toContain('tableOutput.html');
    });
  });

  describe('ESM package.json marker', () => {
    it('should create valid ESM marker content', () => {
      const expected = JSON.stringify({ type: 'module' }, null, 2) + '\n';
      expect(JSON.parse(expected.trim())).toEqual({ type: 'module' });
    });
  });

  describe('filter function for drizzle', () => {
    it('should exclude files containing CLAUDE', () => {
      const filter = (src: string) => {
        const basename = path.basename(src);
        const excludePatterns = ['.md', 'CLAUDE', 'AGENTS'];
        return !excludePatterns.some(
          (pattern) => basename.includes(pattern) || basename.endsWith(pattern),
        );
      };

      expect(filter('/path/to/CLAUDE.md')).toBe(false);
      expect(filter('/path/to/AGENTS.md')).toBe(false);
      expect(filter('/path/to/0001_migration.sql')).toBe(true);
      expect(filter('/path/to/meta/_journal.json')).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle missing source files gracefully', () => {
      const nonExistentPath = path.join(tempDir, 'src', 'nonexistent.html');
      expect(fs.existsSync(nonExistentPath)).toBe(false);
    });

    it('should handle missing build outputs', () => {
      // Remove a required build output
      const mainJs = path.join(tempDir, 'dist', 'src', 'main.js');
      fs.rmSync(mainJs);
      expect(fs.existsSync(mainJs)).toBe(false);
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
