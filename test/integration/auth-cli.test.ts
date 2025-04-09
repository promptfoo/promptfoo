import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
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
    jest.setTimeout(10000); // Increase timeout for CLI commands
    originalEnv = process.env;
    
    // Set environment variables for isolated testing
    process.env = {
      ...originalEnv,
      PROMPTFOO_CONFIG_DIR: tempConfigDir,
      // Add test API endpoints to avoid real network calls
      PROMPTFOO_API_HOST: 'http://localhost:3333',
      PROMPTFOO_APP_URL: 'http://localhost:3334',
      // Disable browser opening
      BROWSER: 'none',
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
   * Helper function to run CLI commands
   */
  async function runCommand(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
      const command = `node -r ts-node/register ${path.resolve('./src/main.ts')} ${args.join(' ')}`;
      const { stdout, stderr } = await execAsync(command);
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
    // Note: These tests only verify command structure
    // and option passing, not actual authentication
    
    it('should accept --api-key parameter', async () => {
      // This will fail because the API key is invalid, but
      // we just want to verify the parameter is passed correctly
      const { stderr } = await runCommand(['auth', 'login', '--api-key', 'invalid-key']);
      
      // Should try to validate the token
      expect(stderr).toContain('Authentication failed');
    });
    
    it('should accept --host parameter', async () => {
      const { stderr } = await runCommand(['auth', 'login', '--host', 'https://example.com']);
      
      // Should try to make a request to the specified host
      expect(stderr).toContain('Authentication failed');
    });
    
    it('should accept --browser parameter', async () => {
      const { stderr } = await runCommand(['auth', 'login', '--browser']);
      
      // Should try to open a browser and then fail on token validation
      expect(stderr).toContain('Authentication failed');
    });
    
    it('should accept --no-browser parameter', async () => {
      // Mock stdin to provide email input
      const { stderr } = await runCommand(['auth', 'login', '--no-browser']);
      
      // Should not try to open a browser and fail on email workflow
      expect(stderr).toContain('Authentication failed');
    });
  });
}); 