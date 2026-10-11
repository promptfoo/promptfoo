import fs from 'fs';

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import logger from '../../../src/logger';
import { printErrorInformation } from '../../../src/util/errors';

vi.mock('fs');

describe('printErrorInformation', () => {
  let infoSpy: MockInstance<typeof logger.info>;
  let debugSpy: MockInstance<typeof logger.debug>;

  beforeEach(() => {
    vi.resetAllMocks();
    infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => logger);
    debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => logger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing when no errorLogFile is provided', () => {
    printErrorInformation();

    expect(infoSpy).not.toHaveBeenCalled();
    expect(fs.statSync).not.toHaveBeenCalled();
  });

  it('does nothing when errorLogFile is an empty string', () => {
    printErrorInformation('');

    expect(infoSpy).not.toHaveBeenCalled();
    expect(fs.statSync).not.toHaveBeenCalled();
  });

  it('does nothing when the error log file does not exist (ENOENT)', () => {
    const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
    enoent.code = 'ENOENT';
    vi.mocked(fs.statSync).mockImplementation(() => {
      throw enoent;
    });

    printErrorInformation('/missing/error.log');

    expect(infoSpy).not.toHaveBeenCalled();
    // ENOENT should not be logged as debug noise
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it('does nothing when the error log file exists but is empty', () => {
    vi.mocked(fs.statSync).mockReturnValue({
      isFile: () => true,
      size: 0,
    } as fs.Stats);

    printErrorInformation('/logs/error.log');

    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('does nothing when the path exists but is not a file', () => {
    vi.mocked(fs.statSync).mockReturnValue({
      isFile: () => false,
      size: 1024,
    } as fs.Stats);

    printErrorInformation('/logs');

    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('logs a debug message for unexpected fs errors (e.g. EACCES)', () => {
    const eacces = new Error('EACCES') as NodeJS.ErrnoException;
    eacces.code = 'EACCES';
    vi.mocked(fs.statSync).mockImplementation(() => {
      throw eacces;
    });

    printErrorInformation('/logs/error.log');

    expect(infoSpy).not.toHaveBeenCalled();
    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '[errorFileHasContents] Error checking if file has contents: /logs/error.log',
      ),
      { error: eacces },
    );
  });

  it('prints only the error log path when no debug log is provided', () => {
    vi.mocked(fs.statSync).mockReturnValue({
      isFile: () => true,
      size: 42,
    } as fs.Stats);

    printErrorInformation('/logs/error.log');

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const message = infoSpy.mock.calls[0][0] as string;
    expect(message).toContain('There were some errors during the operation');
    expect(message).toContain('/logs/error.log');
    expect(message).not.toContain('Debug log:');
  });

  it('prints both error and debug log paths when both are provided', () => {
    vi.mocked(fs.statSync).mockReturnValue({
      isFile: () => true,
      size: 42,
    } as fs.Stats);

    printErrorInformation('/logs/error.log', '/logs/debug.log');

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const message = infoSpy.mock.calls[0][0] as string;
    expect(message).toContain('Error log:');
    expect(message).toContain('/logs/error.log');
    expect(message).toContain('Debug log:');
    expect(message).toContain('/logs/debug.log');
  });

  it('ignores debugLogFile when errorLogFile is missing/empty', () => {
    printErrorInformation(undefined, '/logs/debug.log');

    expect(infoSpy).not.toHaveBeenCalled();
    expect(fs.statSync).not.toHaveBeenCalled();
  });
});
