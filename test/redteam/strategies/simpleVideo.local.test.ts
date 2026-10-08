import { access, writeFile } from 'node:fs/promises';
import os from 'os';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { runCommand, logError } = vi.hoisted(() => ({
  runCommand: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('../../../src/util/runCommand', () => ({ runCommand }));
vi.mock('../../../src/logger', () => ({
  default: { level: 'info', error: logError, warn: vi.fn() },
}));
vi.mock('../../../src/cliState', () => ({ default: { webUI: true } }));
vi.mock('../../../src/redteam/remoteGeneration', () => ({ neverGenerateRemote: () => true }));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
});

afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe('local video command execution', () => {
  it('checks FFmpeg once, passes the filter as one argument, and removes output files', async () => {
    const { addVideoToBase64 } = await import('../../../src/redteam/strategies/simpleVideo');
    const video = Buffer.from('local video fixture');
    const outputPaths: string[] = [];
    runCommand.mockImplementation(async (_file: string, args: string[]) => {
      if (args[0] !== '-version') {
        const outputPath = args.at(-1)!;
        outputPaths.push(outputPath);
        await writeFile(outputPath, video);
      }
      return { stdout: '', stderr: '' };
    });

    const result = await addVideoToBase64(
      [{ vars: { prompt: 'hello world' } }, { vars: { prompt: 'second frame' } }],
      'prompt',
    );

    expect(result.map((test) => test.vars?.prompt)).toEqual([
      video.toString('base64'),
      video.toString('base64'),
    ]);
    expect(runCommand).toHaveBeenCalledTimes(3);
    expect(runCommand).toHaveBeenNthCalledWith(1, 'ffmpeg', ['-version']);
    expect(runCommand).toHaveBeenNthCalledWith(2, 'ffmpeg', [
      '-f',
      'lavfi',
      '-i',
      'color=white:s=640x480:d=5',
      '-vf',
      expect.stringContaining(":text='hello world':fontcolor=black"),
      '-y',
      outputPaths[0],
    ]);
    for (const outputPath of outputPaths) {
      await expect(access(outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });

  it('retains installation guidance and the text fallback when FFmpeg is missing', async () => {
    const { addVideoToBase64 } = await import('../../../src/redteam/strategies/simpleVideo');
    runCommand.mockRejectedValue(
      Object.assign(new Error('spawn ffmpeg ENOENT'), { code: 'ENOENT' }),
    );

    const result = await addVideoToBase64([{ vars: { prompt: 'hello world' } }], 'prompt');

    expect(result[0].vars?.prompt).toBe(Buffer.from('hello world').toString('base64'));
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('FFmpeg must be installed'));
    expect(runCommand).toHaveBeenCalledOnce();
  });

  it('escapes apostrophes without absorbing the following drawtext options', async () => {
    const { addVideoToBase64 } = await import('../../../src/redteam/strategies/simpleVideo');
    const video = Buffer.from('local video fixture');
    runCommand.mockImplementation(async (_file: string, args: string[]) => {
      if (args[0] !== '-version') {
        await writeFile(args.at(-1)!, video);
      }
      return { stdout: '', stderr: '' };
    });

    const result = await addVideoToBase64([{ vars: { prompt: "It's a sunny day" } }], 'prompt');

    const args = runCommand.mock.calls[1][1] as string[];
    expect(args[args.indexOf('-vf') + 1]).toContain(
      String.raw`:text='It'\\\''s a sunny day':fontcolor=black:fontsize=24:`,
    );
    expect(result[0].vars?.prompt).toBe(video.toString('base64'));
    expect(result[0].vars?.video_text).toBe("It's a sunny day");
  });

  it('preserves the Windows drive colon inside the fontfile option', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    const { addVideoToBase64 } = await import('../../../src/redteam/strategies/simpleVideo');
    const video = Buffer.from('local video fixture');
    runCommand.mockImplementation(async (_file: string, args: string[]) => {
      if (args[0] !== '-version') {
        await writeFile(args.at(-1)!, video);
      }
      return { stdout: '', stderr: '' };
    });

    const result = await addVideoToBase64([{ vars: { prompt: 'hello world' } }], 'prompt');

    const args = runCommand.mock.calls[1][1] as string[];
    expect(args[args.indexOf('-vf') + 1]).toContain(
      String.raw`drawtext=fontfile='C\:/Windows/Fonts/arial.ttf':text='hello world':`,
    );
    expect(result[0].vars?.prompt).toBe(video.toString('base64'));
  });

  it('removes partial output and preserves the text fallback on an encoding failure', async () => {
    const { addVideoToBase64 } = await import('../../../src/redteam/strategies/simpleVideo');
    let outputPath: string | undefined;
    runCommand.mockImplementation(async (_file: string, args: string[]) => {
      if (args[0] === '-version') {
        return { stdout: 'FFmpeg', stderr: '' };
      }
      outputPath = args.at(-1)!;
      await writeFile(outputPath, 'partial output');
      throw Object.assign(new Error('FFmpeg encoding failed'), { code: 1 });
    });

    const result = await addVideoToBase64([{ vars: { prompt: 'hello world' } }], 'prompt');

    expect(result[0].vars?.prompt).toBe(Buffer.from('hello world').toString('base64'));
    expect(outputPath).toBeDefined();
    await expect(access(outputPath!)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('FFmpeg encoding failed'));
  });
});
