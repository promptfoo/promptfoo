import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

// Setup mocks first
jest.mock('child_process');
jest.mock('fs');
jest.mock('opener');

// Define variables before using them
const mockSpawn = jest.mocked(spawn);
const cliPath = path.resolve(__dirname, '../../src/main.ts');

// Helper function to run CLI commands
async function runCli(
  args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let exitCode = 0;

    const childProcess = mockSpawn('ts-node', ['--cwdMode', '--transpileOnly', cliPath, ...args], {
      env: process.env,
    });

    childProcess.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    childProcess.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    childProcess.on('close', (code: number) => {
      exitCode = code;
      resolve({
        exitCode,
        stdout,
        stderr,
      });
    });
  });
}

describe('auth CLI commands', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    originalEnv = process.env;
    process.env = { ...originalEnv };

    // Setup temporary config for tests
    jest.mocked(fs.existsSync).mockReturnValue(false);
    jest.mocked(fs.mkdirSync).mockImplementation(() => undefined);

    // Mock child_process.spawn
    const mockChildProcess = {
      stdout: {
        on: jest.fn(),
      },
      stderr: {
        on: jest.fn(),
      },
      on: jest.fn((event, callback) => {
        if (event === 'close') {
          callback(0); // Exit code 0
        }
        return mockChildProcess;
      }),
    };
    mockSpawn.mockReturnValue(mockChildProcess as any);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.resetAllMocks();
  });

  describe('auth login command', () => {
    it('should execute login command successfully', async () => {
      const result = await runCli(['auth', 'login']);

      expect(mockSpawn).toHaveBeenCalledWith(
        'ts-node',
        ['--cwdMode', '--transpileOnly', cliPath, 'auth', 'login'],
        expect.any(Object),
      );
      expect(result.exitCode).toBe(0);
    });

    it('should pass API key when provided', async () => {
      const result = await runCli(['auth', 'login', '--api-key', 'test-api-key']);

      expect(mockSpawn).toHaveBeenCalledWith(
        'ts-node',
        ['--cwdMode', '--transpileOnly', cliPath, 'auth', 'login', '--api-key', 'test-api-key'],
        expect.any(Object),
      );
      expect(result.exitCode).toBe(0);
    });

    it('should pass browser flag when provided', async () => {
      const result = await runCli(['auth', 'login', '--browser']);

      expect(mockSpawn).toHaveBeenCalledWith(
        'ts-node',
        ['--cwdMode', '--transpileOnly', cliPath, 'auth', 'login', '--browser'],
        expect.any(Object),
      );
      expect(result.exitCode).toBe(0);
    });

    it('should handle error exit codes', async () => {
      // Mock error exit code
      mockSpawn.mockReturnValueOnce({
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            callback(1); // Error exit code
          }
          return mockSpawn.mock.results[0].value;
        }),
      } as any);

      const result = await runCli(['auth', 'login']);
      expect(result.exitCode).toBe(1);
    });
  });

  describe('auth logout command', () => {
    it('should execute logout command successfully', async () => {
      const result = await runCli(['auth', 'logout']);

      expect(mockSpawn).toHaveBeenCalledWith(
        'ts-node',
        ['--cwdMode', '--transpileOnly', cliPath, 'auth', 'logout'],
        expect.any(Object),
      );
      expect(result.exitCode).toBe(0);
    });
  });

  describe('auth whoami command', () => {
    it('should execute whoami command successfully', async () => {
      const result = await runCli(['auth', 'whoami']);

      expect(mockSpawn).toHaveBeenCalledWith(
        'ts-node',
        ['--cwdMode', '--transpileOnly', cliPath, 'auth', 'whoami'],
        expect.any(Object),
      );
      expect(result.exitCode).toBe(0);
    });
  });
});
