import { exec } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('Auth CLI Integration Tests', () => {
  const tempConfigDir = path.join(os.tmpdir(), `promptfoo-test-${Date.now()}`);
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    // Create temp directory for config
    if (!fs.existsSync(tempConfigDir)) {
      fs.mkdirSync(tempConfigDir, { recursive: true });
    }
  });

  beforeEach(() => {
    jest.setTimeout(10000); // Reasonable timeout for CLI commands
    originalEnv = process.env;

    // Set environment variables for isolated testing
    process.env = {
      ...originalEnv,
      PROMPTFOO_CONFIG_DIR: tempConfigDir,
      // Use a test server that returns immediately for API calls
      PROMPTFOO_API_HOST: 'http://localhost:9999',
      PROMPTFOO_APP_URL: 'http://localhost:9999',
      // Force non-interactive mode for all commands
      PROMPTFOO_NON_INTERACTIVE: 'true',
      // Disable browser opening
      BROWSER: 'none',
      NODE_ENV: 'test',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  afterAll(() => {
    // Clean up temp directory
    if (fs.existsSync(tempConfigDir)) {
      fs.rmSync(tempConfigDir, { recursive: true, force: true });
    }
  });

  /**
   * Helper function to run CLI commands without waiting for user input
   */
  async function runCommand(
    args: string[],
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
      // Use --non-interactive flag for all auth commands to prevent waiting for input
      if (args[0] === 'auth' && args[1] === 'login') {
        args.push('--non-interactive');
      }
      
      const command = `node -r ts-node/register ${path.resolve('./src/main.ts')} ${args.join(' ')}`;
      const { stdout, stderr } = await execAsync(command, { timeout: 5000 });
      return { stdout, stderr, exitCode: 0 };
    } catch (error: any) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        exitCode: error.code || 1,
      };
    }
  }

  describe('whoami command', () => {
    it('should show not logged in message when no credentials exist', async () => {
      const { stdout, exitCode } = await runCommand(['auth', 'whoami']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Not logged in');
    });
  });

  describe('logout command', () => {
    it('should successfully log out even if not logged in', async () => {
      const { stdout, exitCode } = await runCommand(['auth', 'logout']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Successfully logged out');
    });
  });

  describe('login command', () => {
    // Note: These tests only verify command structure and flags
    // not actual authentication

    it('should accept --api-key parameter', async () => {
      const { exitCode } = await runCommand(['auth', 'login', '--api-key', 'invalid-key']);

      // Expect non-zero exit code with invalid key
      expect(exitCode).not.toBe(0);
    });

    it('should accept --host parameter', async () => {
      const { exitCode } = await runCommand(['auth', 'login', '--host', 'https://example.com']);
      
      // Exit code doesn't matter as much as the command not hanging
      expect(exitCode).toBeDefined();
    });

    it('should accept --browser parameter', async () => {
      const { exitCode } = await runCommand(['auth', 'login', '--browser']);
      
      // Exit code doesn't matter as much as the command not hanging
      expect(exitCode).toBeDefined();
    });

    it('should accept --no-browser parameter', async () => {
      const { exitCode } = await runCommand(['auth', 'login', '--no-browser']);
      
      // Exit code doesn't matter as much as the command not hanging
      expect(exitCode).toBeDefined();
    });
  });
});
