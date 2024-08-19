import crypto from 'crypto';
import fs from 'fs';
import { parseScriptParts, getFileHashes } from '../src/providers/scriptCompletion';

jest.mock('fs');
jest.mock('crypto');

describe('parseScriptParts', () => {
  it('should parse script parts correctly', () => {
    const scriptPath = `node script.js "arg with 'spaces'" 'another arg' simple_arg`;
    const result = parseScriptParts(scriptPath);
    expect(result).toEqual(['node', 'script.js', "arg with 'spaces'", 'another arg', 'simple_arg']);
  });

  it('should handle script path with no arguments', () => {
    const scriptPath = '/bin/bash script.sh';
    const result = parseScriptParts(scriptPath);
    expect(result).toEqual(['/bin/bash', 'script.sh']);
  });
});

describe('getFileHashes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return file hashes for existing files', () => {
    const scriptParts = ['file1.js', 'file2.js', 'nonexistent.js'];
    const mockFileContent1 = 'content1';
    const mockFileContent2 = 'content2';
    const mockHash1 = 'hash1';
    const mockHash2 = 'hash2';

    jest.mocked(fs.existsSync).mockImplementation((path) => path !== 'nonexistent.js');
    jest.mocked(fs.statSync).mockReturnValue({
      isFile: () => true,
      isDirectory: () => false,
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isSymbolicLink: () => false,
      isFIFO: () => false,
      isSocket: () => false,
    } as fs.Stats);
    jest.mocked(fs.readFileSync).mockImplementation((path) => {
      if (path === 'file1.js') {
        return mockFileContent1;
      }
      if (path === 'file2.js') {
        return mockFileContent2;
      }
      throw new Error('File not found');
    });

    const mockHashUpdate = {
      update: jest.fn().mockReturnThis(),
      digest: jest.fn(),
    } as unknown as crypto.Hash;
    jest
      .mocked(mockHashUpdate.digest)
      .mockReturnValueOnce(mockHash1)
      .mockReturnValueOnce(mockHash2);
    jest.mocked(crypto.createHash).mockReturnValue(mockHashUpdate);

    const result = getFileHashes(scriptParts);

    expect(result).toEqual([mockHash1, mockHash2]);
    expect(fs.existsSync).toHaveBeenCalledTimes(3);
    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    expect(crypto.createHash).toHaveBeenCalledTimes(2);
  });

  it('should return an empty array for non-existent files', () => {
    const scriptParts = ['nonexistent1.js', 'nonexistent2.js'];
    jest.mocked(fs.existsSync).mockReturnValue(false);

    const result = getFileHashes(scriptParts);

    expect(result).toEqual([]);
    expect(fs.existsSync).toHaveBeenCalledTimes(2);
    expect(fs.readFileSync).not.toHaveBeenCalled();
    expect(crypto.createHash).not.toHaveBeenCalled();
  });
});
