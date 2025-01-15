import { createWriteStream, type WriteStream } from 'fs';
import { JsonlFileWriter } from '../../../src/util/exportToFile/writeToFile';

jest.mock('fs');

describe('JsonlFileWriter', () => {
  const mockWriteStream = {
    write: jest.fn(),
    end: jest.fn(),
    close: jest.fn(),
    bytesWritten: 0,
    path: '',
    pending: false,
    writable: true,
    destroy: jest.fn(),
    destroySoon: jest.fn(),
    addListener: jest.fn(),
    emit: jest.fn(),
    eventNames: jest.fn(),
    getMaxListeners: jest.fn(),
    listenerCount: jest.fn(),
    listeners: jest.fn(),
    off: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    prependListener: jest.fn(),
    prependOnceListener: jest.fn(),
    rawListeners: jest.fn(),
    removeAllListeners: jest.fn(),
    removeListener: jest.fn(),
    setMaxListeners: jest.fn(),
    writableFinished: true,
    writableEnded: false,
    writableHighWaterMark: 0,
    writableLength: 0,
    writableObjectMode: false,
    writableCorked: 0,
    writableNeedDrain: false,
    closed: false,
    errored: null,
    writableAborted: false,
    destroyed: false,
    readonly: false,
    writev: null,
    _write: jest.fn(),
    _writev: null,
    _destroy: jest.fn(),
    _final: jest.fn(),
    pipeline: jest.fn(),
    cork: jest.fn(),
    uncork: jest.fn(),
    setDefaultEncoding: jest.fn(),
  } as unknown as jest.Mocked<WriteStream>;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(createWriteStream).mockReturnValue(mockWriteStream);
  });

  describe('write', () => {
    it('should write JSON line to file', async () => {
      const writer = new JsonlFileWriter('test.jsonl');
      const testData = { foo: 'bar' };

      mockWriteStream.write.mockImplementation(
        (chunk: any, encoding: any, callback?: (error: Error | null | undefined) => void) => {
          if (typeof encoding === 'function') {
            encoding(null);
          } else if (callback) {
            callback(null);
          }
          return true;
        },
      );

      await writer.write(testData);

      expect(mockWriteStream.write).toHaveBeenCalledWith(
        JSON.stringify(testData) + '\n',
        expect.any(Function),
      );
    });

    it('should reject on write error', async () => {
      const writer = new JsonlFileWriter('test.jsonl');
      const testData = { foo: 'bar' };
      const testError = new Error('Write failed');

      mockWriteStream.write.mockImplementation(
        (chunk: any, encoding: any, callback?: (error: Error | null | undefined) => void) => {
          if (typeof encoding === 'function') {
            encoding(testError);
          } else if (callback) {
            callback(testError);
          }
          return false;
        },
      );

      await expect(writer.write(testData)).rejects.toThrow('Write failed');
    });
  });

  describe('close', () => {
    it('should close write stream', async () => {
      const writer = new JsonlFileWriter('test.jsonl');

      mockWriteStream.end.mockImplementation((callback?: () => void) => {
        if (callback) {
          callback();
        }
        return mockWriteStream;
      });

      await writer.close();

      expect(mockWriteStream.end).toHaveBeenCalledWith(expect.any(Function));
    });
  });
});
