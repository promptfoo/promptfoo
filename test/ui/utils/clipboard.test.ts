/**
 * Tests for clipboard utility.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { ChildProcess } from 'child_process';
import * as childProcess from 'child_process';
import { EventEmitter } from 'events';
import { copyToClipboard, isClipboardAvailable } from '../../../src/ui/utils/clipboard';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execSync: vi.fn(),
}));

/**
 * Create a mock child process for testing spawn.
 */
function createMockProcess(exitCode: number = 0, error?: Error): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  const stdinEmitter = new EventEmitter();
  const stderrEmitter = new EventEmitter();

  proc.stdin = {
    write: vi.fn(),
    end: vi.fn(),
  } as unknown as ChildProcess['stdin'];

  proc.stderr = stderrEmitter as unknown as ChildProcess['stderr'];

  // Schedule the close event to fire after test setup
  setImmediate(() => {
    if (error) {
      proc.emit('error', error);
    } else {
      proc.emit('close', exitCode);
    }
  });

  return proc;
}

describe('clipboard utility', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    // Restore original platform
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  describe('copyToClipboard (async)', () => {
    describe('on macOS', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'darwin' });
      });

      it('should use pbcopy command', async () => {
        vi.mocked(childProcess.spawn).mockReturnValue(createMockProcess(0));

        const result = await copyToClipboard('test content');

        expect(result.success).toBe(true);
        expect(childProcess.spawn).toHaveBeenCalledWith('pbcopy', [], expect.any(Object));
      });

      it('should handle non-zero exit codes', async () => {
        vi.mocked(childProcess.spawn).mockReturnValue(createMockProcess(1));

        const result = await copyToClipboard('test content');

        expect(result.success).toBe(false);
        expect(result.error).toContain('exit');
      });

      it('should handle spawn errors', async () => {
        vi.mocked(childProcess.spawn).mockReturnValue(
          createMockProcess(0, new Error('Command not found')),
        );

        const result = await copyToClipboard('test content');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Command not found');
      });

      it('should write content to stdin and close', async () => {
        const mockProc = createMockProcess(0);
        vi.mocked(childProcess.spawn).mockReturnValue(mockProc);

        await copyToClipboard('test content');

        expect(mockProc.stdin?.write).toHaveBeenCalledWith('test content');
        expect(mockProc.stdin?.end).toHaveBeenCalled();
      });
    });

    describe('on Windows', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
      });

      it('should use clip command', async () => {
        vi.mocked(childProcess.spawn).mockReturnValue(createMockProcess(0));

        const result = await copyToClipboard('test content');

        expect(result.success).toBe(true);
        expect(childProcess.spawn).toHaveBeenCalledWith('clip', [], expect.any(Object));
      });
    });

    describe('on Linux', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'linux' });
        process.env.DISPLAY = ':0';
      });

      afterEach(() => {
        delete process.env.DISPLAY;
      });

      it('should use xclip command with selection args', async () => {
        vi.mocked(childProcess.spawn).mockReturnValue(createMockProcess(0));

        const result = await copyToClipboard('test content');

        expect(result.success).toBe(true);
        expect(childProcess.spawn).toHaveBeenCalledWith(
          'xclip',
          ['-selection', 'clipboard'],
          expect.any(Object),
        );
      });

      it('should fall back to xsel if xclip fails', async () => {
        let callCount = 0;
        vi.mocked(childProcess.spawn).mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            // xclip fails
            return createMockProcess(1);
          }
          // xsel succeeds
          return createMockProcess(0);
        });

        const result = await copyToClipboard('test content');

        expect(result.success).toBe(true);
        expect(childProcess.spawn).toHaveBeenCalledTimes(2);
        expect(childProcess.spawn).toHaveBeenLastCalledWith(
          'xsel',
          ['--clipboard', '--input'],
          expect.any(Object),
        );
      });

      it('should return error when no display available', async () => {
        delete process.env.DISPLAY;
        delete process.env.WAYLAND_DISPLAY;

        const result = await copyToClipboard('test content');

        expect(result.success).toBe(false);
        expect(result.error).toContain('not available');
      });
    });

    describe('on unsupported platform', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'freebsd' });
      });

      it('should return error', async () => {
        const result = await copyToClipboard('test content');

        expect(result.success).toBe(false);
        expect(result.error).toContain('not available');
      });
    });

    describe('error handling', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'darwin' });
      });

      it('should handle empty text', async () => {
        vi.mocked(childProcess.spawn).mockReturnValue(createMockProcess(0));

        const result = await copyToClipboard('');

        expect(result.success).toBe(true);
        expect(childProcess.spawn).toHaveBeenCalled();
      });

      it('should handle text with special characters', async () => {
        vi.mocked(childProcess.spawn).mockReturnValue(createMockProcess(0));

        const specialText = 'Test with "quotes", \'apostrophes\', $pecial & <chars>';
        const result = await copyToClipboard(specialText);

        expect(result.success).toBe(true);
        expect(childProcess.spawn).toHaveBeenCalled();
      });

      it('should handle very long text', async () => {
        vi.mocked(childProcess.spawn).mockReturnValue(createMockProcess(0));

        const longText = 'x'.repeat(100000);
        const result = await copyToClipboard(longText);

        expect(result.success).toBe(true);
      });
    });
  });

  describe('isClipboardAvailable', () => {
    describe('on macOS', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'darwin' });
      });

      it('should return true when pbcopy exists', () => {
        vi.mocked(childProcess.execSync).mockImplementation(() => Buffer.from('/usr/bin/pbcopy'));

        expect(isClipboardAvailable()).toBe(true);
        expect(childProcess.execSync).toHaveBeenCalledWith('which pbcopy', expect.any(Object));
      });

      it('should return false when pbcopy not found', () => {
        vi.mocked(childProcess.execSync).mockImplementation(() => {
          throw new Error('Command not found');
        });

        expect(isClipboardAvailable()).toBe(false);
      });
    });

    describe('on Windows', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
      });

      it('should use where command to check clip', () => {
        vi.mocked(childProcess.execSync).mockImplementation(() =>
          Buffer.from('C:\\Windows\\System32\\clip.exe'),
        );

        expect(isClipboardAvailable()).toBe(true);
        expect(childProcess.execSync).toHaveBeenCalledWith('where clip', expect.any(Object));
      });
    });

    describe('on Linux', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'linux' });
        process.env.DISPLAY = ':0';
      });

      afterEach(() => {
        delete process.env.DISPLAY;
      });

      it('should check for xclip first', () => {
        vi.mocked(childProcess.execSync).mockImplementation(() => Buffer.from('/usr/bin/xclip'));

        expect(isClipboardAvailable()).toBe(true);
        expect(childProcess.execSync).toHaveBeenCalledWith('which xclip', expect.any(Object));
      });

      it('should fall back to xsel', () => {
        let callCount = 0;
        vi.mocked(childProcess.execSync).mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            throw new Error('not found');
          }
          return Buffer.from('/usr/bin/xsel');
        });

        expect(isClipboardAvailable()).toBe(true);
        expect(childProcess.execSync).toHaveBeenCalledTimes(2);
      });

      it('should return false when no display available', () => {
        delete process.env.DISPLAY;
        delete process.env.WAYLAND_DISPLAY;

        expect(isClipboardAvailable()).toBe(false);
      });
    });
  });
});
