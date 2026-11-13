import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import winston from 'winston';

describe('logger shutdown with real file transports', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.resetModules();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-logger-shutdown-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.each([4, 64])(
    'flushes %i queued messages through a backpressured file transport',
    async (count) => {
      const { default: logger, winstonLogger, closeLogger } = await import('../src/logger');
      const filename = path.join(tempDir, 'backpressure.log');
      const transportOptions = {
        filename,
        highWaterMark: 1,
        format: winston.format.printf((info) => String(info.message)),
      };
      const transport = new winston.transports.File(transportOptions);
      winstonLogger.clear().add(transport);

      const errors: Error[] = [];
      winstonLogger.on('error', (error) => errors.push(error));
      const log = transport.log!.bind(transport);
      let release: (() => void) | undefined;
      vi.spyOn(transport, 'log').mockImplementationOnce((info, callback) => {
        log(info, () => {
          release = callback;
        });
      });

      const messages = Array.from({ length: count }, (_, index) => `message ${index}`);
      for (const message of messages) {
        logger.error(message);
      }
      expect(winstonLogger.readableLength).toBeGreaterThan(0);
      if (count > winstonLogger.writableHighWaterMark) {
        expect(winstonLogger.writableLength).toBeGreaterThan(0);
      }
      expect(release).toBeDefined();

      const closing = closeLogger();
      release!();
      await closing;

      expect({ errors, messages: fs.readFileSync(filename, 'utf8').trim().split(/\r?\n/) }).toEqual(
        {
          errors: [],
          messages,
        },
      );
      await closeLogger();
    },
  );

  it('closes an empty file transport without waiting for another log message', async () => {
    const { winstonLogger, closeLogger } = await import('../src/logger');
    const filename = path.join(tempDir, 'empty.log');
    winstonLogger.clear().add(new winston.transports.File({ filename }));

    await closeLogger();

    expect(fs.readFileSync(filename, 'utf8')).toBe('');
    await closeLogger();
  });
});
