import { execSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

describe('inject-build-constants', () => {
  const testDistDir = join(__dirname, 'test-dist');
  const testFilePath = join(testDistDir, 'src', 'generated-constants.js');
  const scriptPath = join(__dirname, '..', 'scripts', 'inject-build-constants.js');

  beforeEach(() => {
    // Create test directory structure
    mkdirSync(join(testDistDir, 'src'), { recursive: true });
    
    // Create a mock compiled file
    const mockCompiledContent = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POSTHOG_KEY = void 0;
exports.POSTHOG_KEY = process.env.PROMPTFOO_POSTHOG_KEY || '';
`;
    writeFileSync(testFilePath, mockCompiledContent);
  });

  afterEach(() => {
    // Clean up test directory
    rmSync(testDistDir, { recursive: true, force: true });
  });

  it('should inject PostHog key when environment variable is set', () => {
    // Set environment variable and run the script
    const env = { ...process.env, PROMPTFOO_POSTHOG_KEY: 'test-key-12345' };
    execSync(`node ${scriptPath}`, { 
      cwd: testDistDir,
      env 
    });

    // Read the modified file
    const modifiedContent = readFileSync(testFilePath, 'utf8');
    
    // Verify the key was injected
    expect(modifiedContent).toContain("exports.POSTHOG_KEY = 'test-key-12345';");
    expect(modifiedContent).not.toContain('process.env.PROMPTFOO_POSTHOG_KEY');
  });

  it('should inject empty string when environment variable is not set', () => {
    // Run the script without setting the environment variable
    const env = { ...process.env };
    delete env.PROMPTFOO_POSTHOG_KEY;
    
    execSync(`node ${scriptPath}`, { 
      cwd: testDistDir,
      env 
    });

    // Read the modified file
    const modifiedContent = readFileSync(testFilePath, 'utf8');
    
    // Verify empty string was injected
    expect(modifiedContent).toContain("exports.POSTHOG_KEY = '';");
    expect(modifiedContent).not.toContain('process.env.PROMPTFOO_POSTHOG_KEY');
  });

  it('should handle missing files gracefully', () => {
    // Remove the test file
    rmSync(testFilePath);

    // Run the script and expect it to exit with error
    expect(() => {
      execSync(`node ${scriptPath}`, { 
        cwd: testDistDir,
        stdio: 'pipe' // Suppress output
      });
    }).toThrow();
  });
}); 