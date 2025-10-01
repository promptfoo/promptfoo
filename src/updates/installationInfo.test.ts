jest.mock('node:fs');
jest.mock('node:child_process');
jest.mock('../logger');

import * as fs from 'node:fs';
import * as childProcess from 'node:child_process';
import { getInstallationInfo, PackageManager } from './installationInfo';
import logger from '../logger';

const mockFs = fs as jest.Mocked<typeof fs>;
const mockChildProcess = childProcess as jest.Mocked<typeof childProcess>;

describe('getInstallationInfo', () => {
  let originalArgv: string[];
  let originalPlatform: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    originalArgv = process.argv;
    originalPlatform = process.platform;
    originalEnv = { ...process.env };

    // Reset environment
    delete process.env.DOCKER;
    Object.defineProperty(process, 'platform', { value: 'linux' });

    // Reset mocks
    mockFs.realpathSync.mockImplementation((path) => path.toString());
    mockFs.existsSync.mockReturnValue(false);
    mockChildProcess.execSync.mockImplementation(() => {
      throw new Error('Command not found');
    });
  });

  afterEach(() => {
    process.argv = originalArgv;
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    process.env = originalEnv;
  });

  it('should return UNKNOWN when no CLI path is available', () => {
    process.argv = ['node'];
    const result = getInstallationInfo('/project', false);
    expect(result).toEqual({
      packageManager: PackageManager.UNKNOWN,
      isGlobal: false,
    });
  });

  it('should detect Docker environment from DOCKER env var', () => {
    process.argv = ['node', '/usr/local/bin/promptfoo'];
    process.env.DOCKER = 'true';

    const result = getInstallationInfo('/project', false);

    expect(result).toEqual({
      packageManager: PackageManager.DOCKER,
      isGlobal: false,
      updateMessage:
        'Running in Docker. Please update with "docker pull promptfoo/promptfoo:latest".',
    });
  });

  it('should detect Docker environment from .dockerenv file', () => {
    process.argv = ['node', '/usr/local/bin/promptfoo'];
    process.env.DOCKER = undefined;
    mockFs.existsSync.mockImplementation((path) => path === '/.dockerenv');

    const result = getInstallationInfo('/project', false);

    expect(result).toEqual({
      packageManager: PackageManager.DOCKER,
      isGlobal: false,
      updateMessage:
        'Running in Docker. Please update with "docker pull promptfoo/promptfoo:latest".',
    });
  });

  it('should detect local git clone', () => {
    process.argv = ['node', '/project/dist/src/main.js'];
    mockFs.realpathSync.mockReturnValue('/project/dist/src/main.js');

    // Mock process.cwd to return /project so isGitRepository works correctly
    jest.spyOn(process, 'cwd').mockReturnValue('/project');
    mockFs.existsSync.mockImplementation((path) => {
      // Allow .git directory detection (handle both Unix and Windows paths)
      if (
        path === '/project/.git' ||
        (typeof path === 'string' && (path.endsWith('/.git') || path.endsWith('\\.git')))
      ) {
        return true;
      }
      // Explicitly deny lock files to avoid npm/yarn/pnpm/bun detection
      if (
        typeof path === 'string' &&
        (path.includes('yarn.lock') ||
          path.includes('pnpm-lock.yaml') ||
          path.includes('bun.lockb') ||
          path.includes('package-lock.json'))
      ) {
        return false;
      }
      // Deny dockerenv to avoid docker detection
      if (path === '/.dockerenv') {
        return false;
      }
      return false;
    });

    const result = getInstallationInfo('/project', false);

    expect(result).toEqual({
      packageManager: PackageManager.UNKNOWN,
      isGlobal: false,
      updateMessage: 'Running from a local git clone. Please update with "git pull".',
    });

    // Restore original process.cwd
    (process.cwd as jest.Mock).mockRestore();
  });

  it('should detect NPX installation', () => {
    process.argv = ['node', '/home/user/.npm/_npx/12345/node_modules/promptfoo/dist/src/main.js'];
    mockFs.realpathSync.mockReturnValue(
      '/home/user/.npm/_npx/12345/node_modules/promptfoo/dist/src/main.js',
    );

    const result = getInstallationInfo('/project', false);

    expect(result).toEqual({
      packageManager: PackageManager.NPX,
      isGlobal: false,
      updateMessage: 'Running via npx, update not applicable.',
    });
  });

  it('should detect PNPX installation', () => {
    process.argv = ['node', '/home/user/.pnpm/_pnpx/12345/node_modules/promptfoo/dist/src/main.js'];
    mockFs.realpathSync.mockReturnValue(
      '/home/user/.pnpm/_pnpx/12345/node_modules/promptfoo/dist/src/main.js',
    );

    const result = getInstallationInfo('/project', false);

    expect(result).toEqual({
      packageManager: PackageManager.PNPX,
      isGlobal: false,
      updateMessage: 'Running via pnpx, update not applicable.',
    });
  });

  it('should detect Homebrew installation on macOS', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    process.argv = ['node', '/usr/local/bin/promptfoo'];
    mockFs.realpathSync.mockReturnValue('/usr/local/bin/promptfoo');
    mockChildProcess.execSync.mockReturnValue(Buffer.from(''));

    const result = getInstallationInfo('/project', false);

    expect(result).toEqual({
      packageManager: PackageManager.HOMEBREW,
      isGlobal: true,
      updateMessage: 'Installed via Homebrew. Please update with "brew upgrade promptfoo".',
    });

    expect(mockChildProcess.execSync).toHaveBeenCalledWith('brew list -1 | grep -q "^promptfoo$"', {
      stdio: 'ignore',
      timeout: 1000,
    });
  });

  it('should skip Homebrew detection on non-macOS platforms', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    process.argv = ['node', '/usr/local/bin/promptfoo'];
    mockFs.realpathSync.mockReturnValue('/usr/local/bin/promptfoo');

    const result = getInstallationInfo('/project', false);

    expect(mockChildProcess.execSync).not.toHaveBeenCalled();
    expect(result.packageManager).toBe(PackageManager.NPM); // Falls back to npm
  });

  it('should detect PNPM global installation', () => {
    process.argv = ['node', '/home/user/.pnpm/global/5/node_modules/promptfoo/dist/src/main.js'];
    mockFs.realpathSync.mockReturnValue(
      '/home/user/.pnpm/global/5/node_modules/promptfoo/dist/src/main.js',
    );

    const result = getInstallationInfo('/project', false);

    expect(result).toEqual({
      packageManager: PackageManager.PNPM,
      isGlobal: true,
      updateCommand: 'pnpm add -g promptfoo@latest',
      updateMessage: 'Installed with pnpm. Attempting to automatically update now...',
    });
  });

  it('should detect PNPM global installation with auto-update disabled', () => {
    process.argv = ['node', '/home/user/.pnpm/global/5/node_modules/promptfoo/dist/src/main.js'];
    mockFs.realpathSync.mockReturnValue(
      '/home/user/.pnpm/global/5/node_modules/promptfoo/dist/src/main.js',
    );

    const result = getInstallationInfo('/project', true);

    expect(result).toEqual({
      packageManager: PackageManager.PNPM,
      isGlobal: true,
      updateCommand: 'pnpm add -g promptfoo@latest',
      updateMessage: 'Please run pnpm add -g promptfoo@latest to update',
    });
  });

  it('should detect Yarn global installation', () => {
    process.argv = ['node', '/home/user/.yarn/global/node_modules/promptfoo/dist/src/main.js'];
    mockFs.realpathSync.mockReturnValue(
      '/home/user/.yarn/global/node_modules/promptfoo/dist/src/main.js',
    );

    const result = getInstallationInfo('/project', false);

    expect(result).toEqual({
      packageManager: PackageManager.YARN,
      isGlobal: true,
      updateCommand: 'yarn global add promptfoo@latest',
      updateMessage: 'Installed with yarn. Attempting to automatically update now...',
    });
  });

  it('should detect Yarn global installation in .config directory', () => {
    process.argv = [
      'node',
      '/home/user/.config/yarn/global/node_modules/promptfoo/dist/src/main.js',
    ];
    mockFs.realpathSync.mockReturnValue(
      '/home/user/.config/yarn/global/node_modules/promptfoo/dist/src/main.js',
    );

    const result = getInstallationInfo('/project', false);

    expect(result).toEqual({
      packageManager: PackageManager.YARN,
      isGlobal: true,
      updateCommand: 'yarn global add promptfoo@latest',
      updateMessage: 'Installed with yarn. Attempting to automatically update now...',
    });
  });

  it('should detect PNPM global installation from PNPM_HOME', () => {
    process.env.PNPM_HOME = '/usr/local/share/pnpm';
    process.argv = [
      'node',
      '/usr/local/share/pnpm/global/5/node_modules/promptfoo/dist/src/main.js',
    ];
    mockFs.realpathSync.mockReturnValue(
      '/usr/local/share/pnpm/global/5/node_modules/promptfoo/dist/src/main.js',
    );

    const result = getInstallationInfo('/project', false);

    expect(result).toEqual({
      packageManager: PackageManager.PNPM,
      isGlobal: true,
      updateCommand: 'pnpm add -g promptfoo@latest',
      updateMessage: 'Installed with pnpm. Attempting to automatically update now...',
    });

    delete process.env.PNPM_HOME;
  });

  it('should detect PNPM global installation from PNPM_HOME on Windows', () => {
    process.env.PNPM_HOME = 'C:\\pnpm-global';
    process.argv = [
      'node',
      'C:\\pnpm-global\\global\\5\\node_modules\\promptfoo\\dist\\src\\main.js',
    ];
    mockFs.realpathSync.mockReturnValue(
      'C:\\pnpm-global\\global\\5\\node_modules\\promptfoo\\dist\\src\\main.js',
    );

    const result = getInstallationInfo('/project', false);

    expect(result).toEqual({
      packageManager: PackageManager.PNPM,
      isGlobal: true,
      updateCommand: 'pnpm add -g promptfoo@latest',
      updateMessage: 'Installed with pnpm. Attempting to automatically update now...',
    });

    delete process.env.PNPM_HOME;
  });

  it('should detect Yarn global installation on Windows', () => {
    process.argv = [
      'node',
      'C:\\Users\\user\\AppData\\Local\\Yarn\\Data\\global\\node_modules\\promptfoo\\dist\\src\\main.js',
    ];
    mockFs.realpathSync.mockReturnValue(
      'C:\\Users\\user\\AppData\\Local\\Yarn\\Data\\global\\node_modules\\promptfoo\\dist\\src\\main.js',
    );

    const result = getInstallationInfo('/project', false);

    expect(result).toEqual({
      packageManager: PackageManager.YARN,
      isGlobal: true,
      updateCommand: 'yarn global add promptfoo@latest',
      updateMessage: 'Installed with yarn. Attempting to automatically update now...',
    });
  });

  it('should detect Yarn global installation from YARN_GLOBAL_FOLDER', () => {
    process.env.YARN_GLOBAL_FOLDER = '/custom/yarn/path';
    process.argv = ['node', '/custom/yarn/path/node_modules/promptfoo/dist/src/main.js'];
    mockFs.realpathSync.mockReturnValue(
      '/custom/yarn/path/node_modules/promptfoo/dist/src/main.js',
    );

    const result = getInstallationInfo('/project', false);

    expect(result).toEqual({
      packageManager: PackageManager.YARN,
      isGlobal: true,
      updateCommand: 'yarn global add promptfoo@latest',
      updateMessage: 'Installed with yarn. Attempting to automatically update now...',
    });

    delete process.env.YARN_GLOBAL_FOLDER;
  });

  it('should detect BUNX installation', () => {
    process.argv = [
      'node',
      '/home/user/.bun/install/cache/promptfoo@1.0.0/node_modules/promptfoo/dist/src/main.js',
    ];
    mockFs.realpathSync.mockReturnValue(
      '/home/user/.bun/install/cache/promptfoo@1.0.0/node_modules/promptfoo/dist/src/main.js',
    );

    const result = getInstallationInfo('/project', false);

    expect(result).toEqual({
      packageManager: PackageManager.BUNX,
      isGlobal: false,
      updateMessage: 'Running via bunx, update not applicable.',
    });
  });

  it('should detect Bun global installation', () => {
    process.argv = ['node', '/home/user/.bun/bin/promptfoo'];
    mockFs.realpathSync.mockReturnValue('/home/user/.bun/bin/promptfoo');

    const result = getInstallationInfo('/project', false);

    expect(result).toEqual({
      packageManager: PackageManager.BUN,
      isGlobal: true,
      updateCommand: 'bun add -g promptfoo@latest',
      updateMessage: 'Installed with bun. Attempting to automatically update now...',
    });
  });

  it('should detect local npm installation', () => {
    process.argv = ['node', '/project/node_modules/promptfoo/dist/src/main.js'];
    mockFs.realpathSync.mockReturnValue('/project/node_modules/promptfoo/dist/src/main.js');
    mockFs.existsSync.mockImplementation((path) => {
      // Normalize path for cross-platform comparison
      const normalizedPath = path.toString().replace(/\\/g, '/');
      return (
        normalizedPath !== '/.dockerenv' &&
        normalizedPath !== '/project/.git' &&
        normalizedPath !== '/project/yarn.lock' &&
        normalizedPath !== '/project/pnpm-lock.yaml' &&
        normalizedPath !== '/project/bun.lockb'
      );
    });

    const result = getInstallationInfo('/project', false);

    expect(result).toEqual({
      packageManager: PackageManager.NPM,
      isGlobal: false,
      updateMessage: "Locally installed. Please update via your project's package.json.",
    });
  });

  it('should detect local yarn installation from yarn.lock', () => {
    process.argv = ['node', '/project/node_modules/promptfoo/dist/src/main.js'];
    mockFs.realpathSync.mockReturnValue('/project/node_modules/promptfoo/dist/src/main.js');
    mockFs.existsSync.mockImplementation((path) => {
      // Normalize path for cross-platform comparison
      const normalizedPath = path.toString().replace(/\\/g, '/');
      return (
        normalizedPath === '/project/yarn.lock' ||
        (normalizedPath !== '/.dockerenv' && normalizedPath !== '/project/.git')
      );
    });

    const result = getInstallationInfo('/project', false);

    expect(result).toEqual({
      packageManager: PackageManager.YARN,
      isGlobal: false,
      updateMessage: "Locally installed. Please update via your project's package.json.",
    });
  });

  it('should detect local pnpm installation from pnpm-lock.yaml', () => {
    process.argv = ['node', '/project/node_modules/promptfoo/dist/src/main.js'];
    mockFs.realpathSync.mockReturnValue('/project/node_modules/promptfoo/dist/src/main.js');
    mockFs.existsSync.mockImplementation((path) => {
      // Normalize path for cross-platform comparison
      const normalizedPath = path.toString().replace(/\\/g, '/');
      return (
        normalizedPath === '/project/pnpm-lock.yaml' ||
        (normalizedPath !== '/.dockerenv' &&
          normalizedPath !== '/project/.git' &&
          normalizedPath !== '/project/yarn.lock' &&
          normalizedPath !== '/project/bun.lockb')
      );
    });

    const result = getInstallationInfo('/project', false);

    expect(result).toEqual({
      packageManager: PackageManager.PNPM,
      isGlobal: false,
      updateMessage: "Locally installed. Please update via your project's package.json.",
    });
  });

  it('should detect local bun installation from bun.lockb', () => {
    process.argv = ['node', '/project/node_modules/promptfoo/dist/src/main.js'];
    mockFs.realpathSync.mockReturnValue('/project/node_modules/promptfoo/dist/src/main.js');
    mockFs.existsSync.mockImplementation((path) => {
      // Normalize path for cross-platform comparison
      const normalizedPath = path.toString().replace(/\\/g, '/');
      return (
        normalizedPath === '/project/bun.lockb' ||
        (normalizedPath !== '/.dockerenv' &&
          normalizedPath !== '/project/.git' &&
          normalizedPath !== '/project/yarn.lock' &&
          normalizedPath !== '/project/pnpm-lock.yaml')
      );
    });

    const result = getInstallationInfo('/project', false);

    expect(result).toEqual({
      packageManager: PackageManager.BUN,
      isGlobal: false,
      updateMessage: "Locally installed. Please update via your project's package.json.",
    });
  });

  it('should fall back to global npm installation', () => {
    process.argv = ['node', '/usr/local/lib/node_modules/promptfoo/dist/src/main.js'];
    mockFs.realpathSync.mockReturnValue('/usr/local/lib/node_modules/promptfoo/dist/src/main.js');

    const result = getInstallationInfo('/project', false);

    expect(result).toEqual({
      packageManager: PackageManager.NPM,
      isGlobal: true,
      updateCommand: 'npm install -g promptfoo@latest',
      updateMessage: 'Installed with npm. Attempting to automatically update now...',
    });
  });

  it('should handle errors gracefully', () => {
    process.argv = ['node', '/path/to/promptfoo'];
    mockFs.realpathSync.mockImplementation(() => {
      throw new Error('Path resolution failed');
    });

    const result = getInstallationInfo('/project', false);

    expect(result).toEqual({
      packageManager: PackageManager.UNKNOWN,
      isGlobal: false,
    });

    // Should log error to debug level
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Installation detection error'),
    );
  });
});
