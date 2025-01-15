import fs from 'fs';
import { JsonlFileWriter } from '../../../src/util/exportToFile/writeToFile';

jest.mock('fs');

describe('JsonlFileWriter', () => {
  const mockWrite = jest.fn();
  const mockEnd = jest.fn();

  // Create a mock WriteStream that includes required properties
  const mockWriteStream = {
    write: mockWrite,
    end: mockEnd,
    close: jest.fn(),
    bytesWritten: 0,
    path: '',
    pending: false,
    writable: true,
    writableEnded: false,
    writableFinished: false,
    writableHighWaterMark: 0,
    writableLength: 0,
    writableObjectMode: false,
    writableCorked: 0,
    closed: false,
    destroyed: false,
    readable: false,
    readableEncoding: null,
    readableEnded: false,
    readableFlowing: null,
    readableHighWaterMark: 0,
    readableLength: 0,
    readableObjectMode: false,
    errored: null,
    writableNeedDrain: false,
    allowHalfOpen: true,
    _writableState: {},
    _readableState: {},
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
  } as unknown as fs.WriteStream;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(fs.createWriteStream).mockReturnValue(mockWriteStream);
  });

  describe('write', () => {
    it('should write data as JSON line to file', async () => {
      const writer = new JsonlFileWriter('test.jsonl');
      const testData = { key: 'value' };

      mockWrite.mockImplementation((_data: string, callback: (error: Error | null) => void) => {
        callback(null);
        return true;
      });

      await writer.write(testData);

      expect(mockWrite).toHaveBeenCalledWith(`${JSON.stringify(testData)}\n`, expect.any(Function));
    });

    it('should reject if write stream encounters error', async () => {
      const writer = new JsonlFileWriter('test.jsonl');
      const testData = { key: 'value' };
      const testError = new Error('Write error');

      mockWrite.mockImplementation((_data: string, callback: (error: Error | null) => void) => {
        callback(testError);
        return false;
      });

      await expect(writer.write(testData)).rejects.toThrow('Write error');
    });
  });

  describe('close', () => {
    it('should close the write stream', async () => {
      const writer = new JsonlFileWriter('test.jsonl');

      mockEnd.mockImplementation((callback: () => void) => {
        callback();
        return mockWriteStream;
      });

      await writer.close();

      expect(mockEnd).toHaveBeenCalledWith(expect.any(Function));
    });
  });
});
