import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('inject-build-constants', () => {
  const projectRoot = join(__dirname, '..');
  const distFile = join(projectRoot, 'dist', 'src', 'generated-constants.js');
  const backupFile = distFile + '.backup';
  
  let originalContent: string | null = null;

  beforeEach(() => {
    // Backup the existing file if it exists
    if (existsSync(distFile)) {
      originalContent = readFileSync(distFile, 'utf8');
      writeFileSync(backupFile, originalContent);
    }
  });

  afterEach(() => {
    // Restore the original file
    if (originalContent && existsSync(backupFile)) {
      writeFileSync(distFile, originalContent);
      require('fs').unlinkSync(backupFile);
    }
  });

  it('should inject constants into the actual dist file', () => {
    // Ensure dist directory exists
    const distDir = join(projectRoot, 'dist', 'src');
    if (!existsSync(distDir)) {
      mkdirSync(distDir, { recursive: true });
    }

    // Create a test file that mimics TypeScript output
    const testContent = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POSTHOG_KEY = void 0;
exports.POSTHOG_KEY = process.env.PROMPTFOO_POSTHOG_KEY || '';
//# sourceMappingURL=generated-constants.js.map`;
    
    writeFileSync(distFile, testContent);

    // Run the injection script with a test key
    const env = { ...process.env, PROMPTFOO_POSTHOG_KEY: 'test-inject-key' };
    execSync('node scripts/inject-build-constants.js', { 
      cwd: projectRoot,
      env 
    });

    // Verify the file was modified
    const modifiedContent = readFileSync(distFile, 'utf8');
    expect(modifiedContent).toContain("exports.POSTHOG_KEY = 'test-inject-key';");
    expect(modifiedContent).not.toContain('process.env.PROMPTFOO_POSTHOG_KEY');
  });

  it('should handle empty environment variable', () => {
    // Ensure dist directory exists
    const distDir = join(projectRoot, 'dist', 'src');
    if (!existsSync(distDir)) {
      mkdirSync(distDir, { recursive: true });
    }

    // Create a test file
    const testContent = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POSTHOG_KEY = void 0;
exports.POSTHOG_KEY = process.env.PROMPTFOO_POSTHOG_KEY || '';`;
    
    writeFileSync(distFile, testContent);

    // Run without environment variable
    const env = { ...process.env };
    delete env.PROMPTFOO_POSTHOG_KEY;
    
    execSync('node scripts/inject-build-constants.js', { 
      cwd: projectRoot,
      env 
    });

    // Verify empty string was injected
    const modifiedContent = readFileSync(distFile, 'utf8');
    expect(modifiedContent).toContain("exports.POSTHOG_KEY = '';");
    expect(modifiedContent).not.toContain('process.env.PROMPTFOO_POSTHOG_KEY');
  });

  it('should exit with error when files are missing', () => {
    // Temporarily rename the dist directory if it exists
    const distDir = join(projectRoot, 'dist');
    const tempDir = join(projectRoot, 'dist-temp');
    
    if (existsSync(distDir)) {
      require('fs').renameSync(distDir, tempDir);
    }

    try {
      // Running the script should fail
      expect(() => {
        execSync('node scripts/inject-build-constants.js', { 
          cwd: projectRoot,
          stdio: 'pipe' 
        });
      }).toThrow();
    } finally {
      // Restore the dist directory
      if (existsSync(tempDir)) {
        require('fs').renameSync(tempDir, distDir);
      }
    }
  });
}); 