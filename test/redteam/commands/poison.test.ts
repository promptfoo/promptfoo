import fs from 'fs';
import path from 'path';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getUserEmail } from '../../../src/globalConfig/accounts';
import {
  doPoisonDocuments,
  generatePoisonedDocument,
  getAllFiles,
  poisonDocument,
} from '../../../src/redteam/commands/poison';
import { getRemoteGenerationUrl } from '../../../src/redteam/remoteGeneration';

const mockFsReadFileSync = vi.hoisted(() => vi.fn());
const mockFsExistsSync = vi.hoisted(() => vi.fn());
const mockFsStatSync = vi.hoisted(() => vi.fn());
const mockFsMkdirSync = vi.hoisted(() => vi.fn());
const mockFsWriteFileSync = vi.hoisted(() => vi.fn());
const mockFsReaddirSync = vi.hoisted(() => vi.fn());

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      readFileSync: mockFsReadFileSync,
      existsSync: mockFsExistsSync,
      statSync: mockFsStatSync,
      mkdirSync: mockFsMkdirSync,
      writeFileSync: mockFsWriteFileSync,
      readdirSync: mockFsReaddirSync,
    },
    readFileSync: mockFsReadFileSync,
    existsSync: mockFsExistsSync,
    statSync: mockFsStatSync,
    mkdirSync: mockFsMkdirSync,
    writeFileSync: mockFsWriteFileSync,
    readdirSync: mockFsReaddirSync,
  };
});

const mockPathJoin = vi.hoisted(() => vi.fn());
const mockPathRelative = vi.hoisted(() => vi.fn());
const mockPathResolve = vi.hoisted(() => vi.fn());
const mockPathDirname = vi.hoisted(() => vi.fn().mockReturnValue('mock-dir'));

vi.mock('path', async () => ({
  ...(await vi.importActual('path')),
  default: {
    ...(await vi.importActual<typeof import('path')>('path')),
    resolve: mockPathResolve,
    join: mockPathJoin,
    relative: mockPathRelative,
    dirname: mockPathDirname,
  },
  resolve: mockPathResolve,
  join: mockPathJoin,
  relative: mockPathRelative,
  dirname: mockPathDirname,
}));

describe('poison command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set default implementations for fs mocks
    mockFsMkdirSync.mockImplementation(() => '/mock/dir');
    mockFsWriteFileSync.mockReturnValue(undefined);
    mockFsReadFileSync.mockReturnValue('test content');
    mockFsExistsSync.mockReturnValue(true);
  });

  describe('getAllFiles', () => {
    it('should get all files recursively', () => {
      const mockFiles = ['file1.txt', 'file2.txt'];
      const mockDirs = ['dir1'];

      vi.mocked(fs.readdirSync).mockImplementationOnce(function () {
        return [...mockFiles, ...mockDirs] as any;
      });
      vi.mocked(fs.readdirSync).mockImplementationOnce(function () {
        return [] as any;
      });

      vi.mocked(fs.statSync).mockImplementation(function (filePath) {
        return {
          isDirectory: () => filePath.toString().includes('dir1'),
        } as fs.Stats;
      });

      vi.mocked(path.join).mockImplementation(function (...parts) {
        return parts.join('/');
      });

      const files = getAllFiles('testDir');
      expect(files).toEqual(['testDir/file1.txt', 'testDir/file2.txt']);
    });
  });

  describe('generatePoisonedDocument', () => {
    it('should call remote API and return response', async () => {
      const mockResponse = {
        ok: true,
        json: () =>
          Promise.resolve({
            poisonedDocument: 'poisoned content',
            intendedResult: 'result',
            task: 'poison-document',
          }),
        headers: new Headers(),
        redirected: false,
        status: 200,
        statusText: 'OK',
        type: 'basic',
        url: 'test-url',
      } as Response;

      vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse);

      const result = await generatePoisonedDocument('test doc', 'test goal');

      expect(fetch).toHaveBeenCalledWith(getRemoteGenerationUrl(), {
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          task: 'poison-document',
          document: 'test doc',
          goal: 'test goal',
          email: getUserEmail(),
        }),
      });

      expect(result).toEqual({
        poisonedDocument: 'poisoned content',
        intendedResult: 'result',
        task: 'poison-document',
      });
    });

    it('should throw error on API failure', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('API Error'),
        headers: new Headers(),
        redirected: false,
        type: 'basic',
        url: 'test-url',
      } as Response;

      vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse);

      await expect(generatePoisonedDocument('test doc')).rejects.toThrow(
        'Failed to generate poisoned document',
      );
    });
  });

  describe('poisonDocument', () => {
    it('should poison file document', async () => {
      const mockDoc = {
        docLike: 'test.txt',
        isFile: true,
        dir: null,
      };

      vi.mocked(fs.readFileSync).mockImplementation(function () {
        return 'test content';
      });
      vi.mocked(path.relative).mockImplementation(function (_from, _to) {
        return 'test.txt';
      });
      vi.mocked(path.dirname).mockImplementation(function () {
        return 'output-dir';
      });
      vi.mocked(path.join).mockImplementation(function (...args) {
        return args.join('/');
      });

      const mockPoisonResponse = {
        poisonedDocument: 'poisoned content',
        intendedResult: 'result',
        task: 'poison-document',
      };

      const mockResponse = {
        ok: true,
        json: () => Promise.resolve(mockPoisonResponse),
        headers: new Headers(),
        redirected: false,
        status: 200,
        statusText: 'OK',
        type: 'basic',
        url: 'test-url',
      } as Response;

      vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse);

      const result = await poisonDocument(mockDoc, 'output-dir');

      expect(result).toEqual({
        originalPath: 'test.txt',
        poisonedDocument: 'poisoned content',
        intendedResult: 'result',
      });
    });

    it('should poison content document', async () => {
      const mockDoc = {
        docLike: 'test content',
        isFile: false,
        dir: null,
      };

      const mockPoisonResponse = {
        poisonedDocument: 'poisoned content',
        intendedResult: 'result',
        task: 'poison-document',
      };

      const mockResponse = {
        ok: true,
        json: () => Promise.resolve(mockPoisonResponse),
        headers: new Headers(),
        redirected: false,
        status: 200,
        statusText: 'OK',
        type: 'basic',
        url: 'test-url',
      } as Response;

      vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse);

      const result = await poisonDocument(mockDoc, 'output-dir');

      expect(result).toEqual({
        poisonedDocument: 'poisoned content',
        intendedResult: 'result',
      });
    });

    it('should throw error when poisoning fails', async () => {
      const mockDoc = {
        docLike: 'test.txt',
        isFile: true,
        dir: null,
      };

      vi.mocked(fs.readFileSync).mockImplementation(function () {
        throw new Error('File read error');
      });

      await expect(poisonDocument(mockDoc, 'output-dir')).rejects.toThrow(
        'Failed to poison test.txt: Error: File read error',
      );
    });
  });

  describe('doPoisonDocuments', () => {
    it('should process multiple documents', async () => {
      const options = {
        documents: ['test.txt', 'test content'],
        goal: 'test goal',
        output: 'output.yaml',
        outputDir: 'output-dir',
      };

      vi.mocked(fs.existsSync).mockImplementation(function (path) {
        return path === 'test.txt';
      });
      vi.mocked(fs.statSync).mockImplementation(function () {
        return {
          isDirectory: () => false,
        } as fs.Stats;
      });

      vi.mocked(path.relative).mockImplementation(function (_from, _to) {
        return 'test.txt';
      });
      vi.mocked(path.dirname).mockImplementation(function () {
        return 'output-dir';
      });
      vi.mocked(path.join).mockImplementation(function (...args) {
        return args.join('/');
      });

      const mockPoisonResponse = {
        poisonedDocument: 'poisoned content',
        intendedResult: 'result',
        task: 'poison-document',
      };

      const mockResponse = {
        ok: true,
        json: () => Promise.resolve(mockPoisonResponse),
        headers: new Headers(),
        redirected: false,
        status: 200,
        statusText: 'OK',
        type: 'basic',
        url: 'test-url',
      } as Response;

      vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse);

      await doPoisonDocuments(options);

      expect(fs.mkdirSync).toHaveBeenCalledWith('output-dir', { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith('output.yaml', expect.any(String));
    });

    it('should handle directory input', async () => {
      const options = {
        documents: ['test-dir'],
        goal: 'test goal',
        output: 'output.yaml',
        outputDir: 'output-dir',
      };

      vi.mocked(fs.existsSync).mockImplementation(function () {
        return true;
      });
      vi.mocked(fs.statSync)
        .mockImplementationOnce(function () {
          return {
            isDirectory: () => true,
          } as fs.Stats;
        })
        .mockReturnValue({
          isDirectory: () => false,
        } as fs.Stats);

      vi.mocked(fs.readdirSync).mockImplementationOnce(function () {
        return ['file1.txt'] as any;
      });
      vi.mocked(path.join).mockImplementation(function (...parts) {
        return parts.join('/');
      });
      vi.mocked(path.relative).mockImplementation(function (_from, _to) {
        return 'file1.txt';
      });
      vi.mocked(path.dirname).mockImplementation(function () {
        return 'output-dir';
      });

      const mockPoisonResponse = {
        poisonedDocument: 'poisoned content',
        intendedResult: 'result',
        task: 'poison-document',
      };

      const mockResponse = {
        ok: true,
        json: () => Promise.resolve(mockPoisonResponse),
        headers: new Headers(),
        redirected: false,
        status: 200,
        statusText: 'OK',
        type: 'basic',
        url: 'test-url',
      } as Response;

      vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse);

      await doPoisonDocuments(options);

      expect(fs.mkdirSync).toHaveBeenCalledWith('output-dir', { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith('output.yaml', expect.any(String));
    });
  });
});
