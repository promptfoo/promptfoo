import path from 'path';
import {
  isJavascriptFile,
  isImageFile,
  isVideoFile,
  isAudioFile,
  getResolvedRelativePath,
} from '../../src/util/file';
import { safeResolve, safeJoin } from '../../src/util/file.node';

describe('file utilities', () => {
  // Helper to create platform-appropriate file URLs
  const getFileUrl = (path: string) => {
    return process.platform === 'win32'
      ? `file:///C:/${path.replace(/\\/g, '/')}`
      : `file:///${path}`;
  };

  describe('isJavascriptFile', () => {
    it('identifies JavaScript and TypeScript files', () => {
      expect(isJavascriptFile('test.js')).toBe(true);
      expect(isJavascriptFile('test.cjs')).toBe(true);
      expect(isJavascriptFile('test.mjs')).toBe(true);
      expect(isJavascriptFile('test.ts')).toBe(true);
      expect(isJavascriptFile('test.cts')).toBe(true);
      expect(isJavascriptFile('test.mts')).toBe(true);
      expect(isJavascriptFile('test.txt')).toBe(false);
      expect(isJavascriptFile('test.py')).toBe(false);
    });
  });

  describe('isImageFile', () => {
    it('identifies image files correctly', () => {
      expect(isImageFile('photo.jpg')).toBe(true);
      expect(isImageFile('image.jpeg')).toBe(true);
      expect(isImageFile('icon.png')).toBe(true);
      expect(isImageFile('anim.gif')).toBe(true);
      expect(isImageFile('image.bmp')).toBe(true);
      expect(isImageFile('photo.webp')).toBe(true);
      expect(isImageFile('icon.svg')).toBe(true);
      expect(isImageFile('doc.pdf')).toBe(false);
      expect(isImageFile('noextension')).toBe(false);
    });
  });

  describe('isVideoFile', () => {
    it('identifies video files correctly', () => {
      expect(isVideoFile('video.mp4')).toBe(true);
      expect(isVideoFile('clip.webm')).toBe(true);
      expect(isVideoFile('video.ogg')).toBe(true);
      expect(isVideoFile('movie.mov')).toBe(true);
      expect(isVideoFile('video.avi')).toBe(true);
      expect(isVideoFile('clip.wmv')).toBe(true);
      expect(isVideoFile('movie.mkv')).toBe(true);
      expect(isVideoFile('video.m4v')).toBe(true);
      expect(isVideoFile('doc.pdf')).toBe(false);
      expect(isVideoFile('noextension')).toBe(false);
    });
  });

  describe('isAudioFile', () => {
    it('identifies audio files correctly', () => {
      expect(isAudioFile('sound.wav')).toBe(true);
      expect(isAudioFile('music.mp3')).toBe(true);
      expect(isAudioFile('audio.ogg')).toBe(true);
      expect(isAudioFile('sound.aac')).toBe(true);
      expect(isAudioFile('music.m4a')).toBe(true);
      expect(isAudioFile('audio.flac')).toBe(true);
      expect(isAudioFile('sound.wma')).toBe(true);
      expect(isAudioFile('music.aiff')).toBe(true);
      expect(isAudioFile('voice.opus')).toBe(true);
      expect(isAudioFile('doc.pdf')).toBe(false);
      expect(isAudioFile('noextension')).toBe(false);
    });
  });

  describe('getResolvedRelativePath', () => {
    const originalCwd = process.cwd();

    beforeEach(() => {
      jest.spyOn(process, 'cwd').mockReturnValue('/mock/cwd');
    });

    afterEach(() => {
      jest.spyOn(process, 'cwd').mockReturnValue(originalCwd);
    });

    it('returns absolute path unchanged', () => {
      const absolutePath = path.resolve('/absolute/path/file.txt');
      expect(getResolvedRelativePath(absolutePath, '/some/base/path')).toBe(absolutePath);
    });

    it('resolves relative path with contextBasePath', () => {
      expect(getResolvedRelativePath('relative/file.txt', '/base/path')).toBe(
        path.join('/base/path', 'relative/file.txt'),
      );
    });

    it('uses process.cwd() when isCloudConfig is true', () => {
      expect(getResolvedRelativePath('relative/file.txt', '/base/path', true)).toBe(
        path.join('/mock/cwd', 'relative/file.txt'),
      );
    });

    it('uses process.cwd() when contextBasePath is undefined', () => {
      expect(getResolvedRelativePath('relative/file.txt')).toBe(
        path.join('/mock/cwd', 'relative/file.txt'),
      );
    });
  });

  describe('safeResolve', () => {
    it('returns absolute path unchanged', () => {
      const absolutePath = path.resolve('/absolute/path/file.txt');
      expect(safeResolve('some/base/path', absolutePath)).toBe(absolutePath);
    });

    it('returns file URL unchanged', () => {
      const fileUrl = getFileUrl('absolute/path/file.txt');
      expect(safeResolve('some/base/path', fileUrl)).toBe(fileUrl);
    });

    it('resolves relative paths', () => {
      const expected = path.resolve('base/path', 'relative/file.txt');
      expect(safeResolve('base/path', 'relative/file.txt')).toBe(expected);
    });

    it('handles multiple path segments', () => {
      const absolutePath = path.resolve('/absolute/path/file.txt');
      expect(safeResolve('base', 'path', absolutePath)).toBe(absolutePath);

      const expected = path.resolve('base', 'path', 'relative/file.txt');
      expect(safeResolve('base', 'path', 'relative/file.txt')).toBe(expected);
    });

    it('handles empty input', () => {
      expect(safeResolve()).toBe(path.resolve());
      expect(safeResolve('')).toBe(path.resolve(''));
    });
  });

  describe('safeJoin', () => {
    it('returns absolute path unchanged', () => {
      const absolutePath = path.resolve('/absolute/path/file.txt');
      expect(safeJoin('some/base/path', absolutePath)).toBe(absolutePath);
    });

    it('returns file URL unchanged', () => {
      const fileUrl = getFileUrl('absolute/path/file.txt');
      expect(safeJoin('some/base/path', fileUrl)).toBe(fileUrl);
    });

    it('joins relative paths', () => {
      const expected = path.join('base/path', 'relative/file.txt');
      expect(safeJoin('base/path', 'relative/file.txt')).toBe(expected);
    });

    it('handles multiple path segments', () => {
      const absolutePath = path.resolve('/absolute/path/file.txt');
      expect(safeJoin('base', 'path', absolutePath)).toBe(absolutePath);

      const expected = path.join('base', 'path', 'relative/file.txt');
      expect(safeJoin('base', 'path', 'relative/file.txt')).toBe(expected);
    });

    it('handles empty input', () => {
      expect(safeJoin()).toBe(path.join());
      expect(safeJoin('')).toBe(path.join(''));
    });
  });
});
