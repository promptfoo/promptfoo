/**
 * Tests for clipboard utility.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as childProcess from 'child_process';
import { copyToClipboard, isClipboardAvailable } from '../../../src/ui/utils/clipboard';

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

describe('clipboard utility', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    // Restore original platform
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  describe('copyToClipboard', () => {
    describe('on macOS', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'darwin' });
      });

      it('should use pbcopy command', () => {
        vi.mocked(childProcess.execSync).mockImplementation(() => Buffer.from(''));

        const result = copyToClipboard('test content');

        expect(result.success).toBe(true);
        expect(childProcess.execSync).toHaveBeenCalledWith(
          'pbcopy',
          expect.objectContaining({ input: 'test content' }),
        );
      });

      it('should handle errors', () => {
        vi.mocked(childProcess.execSync).mockImplementation(() => {
          throw new Error('Command failed');
        });

        const result = copyToClipboard('test content');

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    describe('on Windows', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
      });

      it('should use clip command', () => {
        vi.mocked(childProcess.execSync).mockImplementation(() => Buffer.from(''));

        const result = copyToClipboard('test content');

        expect(result.success).toBe(true);
        expect(childProcess.execSync).toHaveBeenCalledWith(
          'clip',
          expect.objectContaining({ input: 'test content' }),
        );
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

      it('should use xclip command', () => {
        vi.mocked(childProcess.execSync).mockImplementation(() => Buffer.from(''));

        const result = copyToClipboard('test content');

        expect(result.success).toBe(true);
        expect(childProcess.execSync).toHaveBeenCalledWith(
          'xclip -selection clipboard',
          expect.objectContaining({ input: 'test content' }),
        );
      });

      it('should fall back to xsel if xclip fails', () => {
        let callCount = 0;
        vi.mocked(childProcess.execSync).mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            // xclip fails
            throw new Error('Command not found');
          }
          // xsel succeeds
          return Buffer.from('');
        });

        const result = copyToClipboard('test content');

        expect(result.success).toBe(true);
        expect(childProcess.execSync).toHaveBeenCalledTimes(2);
      });

      it('should return error when no display available', () => {
        delete process.env.DISPLAY;
        delete process.env.WAYLAND_DISPLAY;

        const result = copyToClipboard('test content');

        expect(result.success).toBe(false);
        expect(result.error).toContain('not available');
      });
    });

    describe('on unsupported platform', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'freebsd' });
      });

      it('should return error', () => {
        const result = copyToClipboard('test content');

        expect(result.success).toBe(false);
        expect(result.error).toContain('not available');
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
    });
  });
});
