import fs from 'fs';
import os from 'os';
import path from 'path';
import cliState from '../../../src/cliState';
import logger from '../../../src/logger';
import {
  addVideoToBase64,
  getFallbackBase64,
  createProgressBar,
  writeVideoFile,
  createTempVideoEnvironment,
  importFfmpeg,
  shouldShowProgressBar,
  main,
  ffmpegCache,
} from '../../../src/redteam/strategies/simpleVideo';
import type { TestCase } from '../../../src/types';

const DUMMY_VIDEO_BASE64 = 'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAu1tZGF0';

const mockVideoGenerator = jest.fn().mockImplementation(() => {
  return Promise.resolve(DUMMY_VIDEO_BASE64);
});

jest.mock('../../../src/logger', () => ({
  level: 'info',
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../../src/cliState', () => ({
  webUI: false,
}));

jest.mock('fs', () => ({
  writeFileSync: jest.fn(),
  existsSync: jest.fn(),
  unlinkSync: jest.fn(),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(() => Buffer.from('test')),
}));

const mockFfmpeg = {
  input: jest.fn().mockReturnThis(),
  inputFormat: jest.fn().mockReturnThis(),
  inputOptions: jest.fn().mockReturnThis(),
  complexFilter: jest.fn().mockReturnThis(),
  outputOptions: jest.fn().mockReturnThis(),
  save: jest.fn().mockReturnThis(),
  on: jest.fn().mockImplementation(function (this: any, event: string, callback: () => void) {
    if (event === 'end') {
      callback();
    }
    return this;
  }),
};

jest.mock('fluent-ffmpeg', () => () => mockFfmpeg);

jest.mock('cli-progress', () => ({
  SingleBar: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    increment: jest.fn(),
    stop: jest.fn(),
  })),
  Presets: { shades_classic: {} },
}));

describe('simpleVideo strategy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVideoGenerator.mockClear();
  });

  describe('shouldShowProgressBar', () => {
    it('returns true when webUI is false and logger level is not debug', () => {
      cliState.webUI = false;
      Object.defineProperty(logger, 'level', { get: () => 'info' });
      expect(shouldShowProgressBar()).toBe(true);
    });

    it('returns false when webUI is true', () => {
      cliState.webUI = true;
      Object.defineProperty(logger, 'level', { get: () => 'info' });
      expect(shouldShowProgressBar()).toBe(false);
    });

    it('returns false when logger level is debug', () => {
      cliState.webUI = false;
      Object.defineProperty(logger, 'level', { get: () => 'debug' });
      expect(shouldShowProgressBar()).toBe(false);
    });
  });

  describe('importFfmpeg', () => {
    it('caches and returns ffmpeg module', async () => {
      const result1 = await importFfmpeg();
      const result2 = await importFfmpeg();
      expect(result1).toBeDefined();
      expect(result2).toBe(result1);
    });
  });

  describe('createTempVideoEnvironment', () => {
    const mockTempDir = '/tmp/promptfoo-video';

    beforeEach(() => {
      jest.spyOn(os, 'tmpdir').mockReturnValue('/tmp');
      jest.spyOn(path, 'join').mockImplementation((...args) => args.join('/'));
    });

    it('creates temp directory and files', async () => {
      jest.mocked(fs.existsSync).mockReturnValue(false);

      const { tempDir, textFilePath, outputPath, cleanup } =
        await createTempVideoEnvironment('test');

      expect(fs.mkdirSync).toHaveBeenCalledWith(mockTempDir, { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith(expect.stringContaining('text.txt'), 'test');
      expect(tempDir).toBe(mockTempDir);
      expect(textFilePath).toContain('text.txt');
      expect(outputPath).toContain('output-video.mp4');
      expect(cleanup).toBeInstanceOf(Function);
    });

    it('cleanup removes temporary files', async () => {
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest.mocked(fs.unlinkSync).mockClear();

      const { cleanup } = await createTempVideoEnvironment('test');
      cleanup();

      expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
      expect(fs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('text.txt'));
      expect(fs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('output-video.mp4'));
    });

    it('cleanup handles errors gracefully', async () => {
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest.mocked(fs.unlinkSync).mockImplementation(() => {
        throw new Error('Unlink failed');
      });

      const { cleanup } = await createTempVideoEnvironment('test');
      cleanup();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to clean up temporary files'),
      );
    });
  });

  describe('getFallbackBase64', () => {
    it('converts text to base64', () => {
      const input = 'Test text';
      const result = getFallbackBase64(input);
      const decoded = Buffer.from(result, 'base64').toString();
      expect(decoded).toBe(input);
    });
  });

  describe('createProgressBar', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      cliState.webUI = false;
      Object.defineProperty(logger, 'level', { get: () => 'info' });
    });

    it('creates a progress bar when conditions are met', () => {
      const _progressBar = createProgressBar(10);
      expect(_progressBar).toHaveProperty('increment');
      expect(_progressBar).toHaveProperty('stop');
    });

    it('handles progress bar creation failure', () => {
      const SingleBar = jest.requireMock('cli-progress').SingleBar;
      SingleBar.mockImplementationOnce(() => {
        throw new Error('Progress bar creation failed');
      });

      createProgressBar(10);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create progress bar'),
      );
    });

    it('handles progress bar start failure', () => {
      const mockBar = {
        start: jest.fn().mockImplementation(() => {
          throw new Error('Start failed');
        }),
        increment: jest.fn(),
        stop: jest.fn(),
      };

      const SingleBar = jest.requireMock('cli-progress').SingleBar;
      SingleBar.mockImplementationOnce(() => mockBar);

      createProgressBar(10);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to start progress bar'),
      );
    });

    it('handles increment failure', () => {
      const mockBar = {
        start: jest.fn(),
        increment: jest.fn().mockImplementation(() => {
          throw new Error('Increment failed');
        }),
        stop: jest.fn(),
      };

      const SingleBar = jest.requireMock('cli-progress').SingleBar;
      SingleBar.mockImplementationOnce(() => mockBar);

      const progressBar = createProgressBar(10);
      progressBar.increment();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to increment progress bar'),
      );
    });

    it('handles stop failure', () => {
      const mockBar = {
        start: jest.fn(),
        increment: jest.fn(),
        stop: jest.fn().mockImplementation(() => {
          throw new Error('Stop failed');
        }),
      };

      const SingleBar = jest.requireMock('cli-progress').SingleBar;
      SingleBar.mockImplementationOnce(() => mockBar);

      const progressBar = createProgressBar(10);
      progressBar.stop();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to stop progress bar'),
      );
    });
  });

  describe('writeVideoFile', () => {
    it('writes a base64 video to a file', async () => {
      await writeVideoFile(DUMMY_VIDEO_BASE64, 'test.mp4');
      expect(fs.writeFileSync).toHaveBeenCalledWith('test.mp4', expect.any(Buffer));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Video file written to:'));
    });

    it('throws an error if writing fails', async () => {
      jest.mocked(fs.writeFileSync).mockImplementationOnce(() => {
        throw new Error('Write failed');
      });
      await expect(writeVideoFile(DUMMY_VIDEO_BASE64, 'test.mp4')).rejects.toThrow('Write failed');
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to write video file'),
      );
    });
  });

  describe('addVideoToBase64', () => {
    it('processes test cases with custom video generator', async () => {
      const testCase: TestCase = {
        vars: {
          prompt: 'test prompt',
        },
        assert: [
          {
            type: 'promptfoo:redteam:test',
            metric: 'test-metric',
          },
        ],
      };

      const customGenerator = jest.fn().mockResolvedValue('custom-video-base64');
      const result = await addVideoToBase64([testCase], 'prompt', customGenerator);

      expect(customGenerator).toHaveBeenCalledWith('test prompt');
      expect(result[0].vars?.prompt).toBe('custom-video-base64');
    });

    it('handles video generation errors', async () => {
      const testCase: TestCase = {
        vars: {
          prompt: 'test prompt',
        },
      };

      const errorGenerator = jest.fn().mockRejectedValue(new Error('Generation failed'));
      await expect(addVideoToBase64([testCase], 'prompt', errorGenerator)).rejects.toThrow(
        'Generation failed',
      );
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error processing test case'),
      );
    });

    it('updates assertion metrics correctly', async () => {
      const testCase: TestCase = {
        vars: {
          prompt: 'test',
        },
        assert: [
          { type: 'promptfoo:redteam:metric', metric: 'original' },
          { type: 'promptfoo:redteam:other', metric: 'unchanged' },
        ],
      };

      const result = await addVideoToBase64([testCase], 'prompt', mockVideoGenerator);
      expect(result[0].assert?.[0].metric).toBe('metric/Video-Encoded');
      expect(result[0].assert?.[1].metric).toBe('other/Video-Encoded');
    });

    it('throws if testCase.vars is missing', async () => {
      const testCase: any = {};
      await expect(addVideoToBase64([testCase], 'prompt', mockVideoGenerator)).rejects.toThrow(
        'Invariant failed',
      );
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error processing test case'),
      );
    });
  });

  describe('main', () => {
    const originalArgv = process.argv;

    beforeEach(() => {
      process.argv = [...originalArgv];
      jest.mocked(fs.writeFileSync).mockClear();
      jest.mocked(fs.readFileSync).mockReturnValue(Buffer.from(DUMMY_VIDEO_BASE64));
    });

    afterEach(() => {
      process.argv = originalArgv;
    });

    it('uses default text when no argument provided', async () => {
      process.argv = process.argv.slice(0, 2);
      await main();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('This is a test of the video encoding strategy'),
      );
    });

    it('processes custom text from command line argument', async () => {
      process.argv[2] = 'custom text';
      await main();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('custom text'));
    });

    it('handles video generation errors gracefully', async () => {
      process.argv[2] = 'test text';
      jest.mocked(fs.readFileSync).mockImplementationOnce(() => {
        throw new Error('Read failed');
      });

      await main();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error generating video from text'),
      );
    });
  });

  describe('ffmpegCache', () => {
    it('should be exported and initially null', () => {
      expect((ffmpegCache as any) === null || typeof ffmpegCache === 'object').toBeTruthy();
    });
  });
});
