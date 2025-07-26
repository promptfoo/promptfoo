import fs from 'fs';
import path from 'path';

import { getUserEmail } from '../../../src/globalConfig/accounts';
import {
  doPoisonDocuments,
  generatePoisonedDocument,
  getAllFiles,
  poisonDocument,
} from '../../../src/redteam/commands/poison';
import { getRemoteGenerationUrl } from '../../../src/redteam/remoteGeneration';

jest.mock('fs');
jest.mock('path', () => ({
  ...jest.requireActual('path'),
  resolve: jest.fn(),
  join: jest.fn(),
  relative: jest.fn(),
  dirname: jest.fn().mockReturnValue('mock-dir'),
}));
jest.mock('node-fetch');

describe('poison command', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(fs.mkdirSync).mockReturnValue('/mock/dir');
    jest.mocked(fs.writeFileSync).mockReturnValue();
  });

  describe('getAllFiles', () => {
    it('should get all files recursively', () => {
      const mockFiles = ['file1.txt', 'file2.txt'];
      const mockDirs = ['dir1'];

      jest.mocked(fs.readdirSync).mockReturnValueOnce([...mockFiles, ...mockDirs] as any);
      jest.mocked(fs.readdirSync).mockReturnValueOnce([] as any);

      jest.mocked(fs.statSync).mockImplementation(
        (filePath) =>
          ({
            isDirectory: () => filePath.toString().includes('dir1'),
          }) as fs.Stats,
      );

      jest.mocked(path.join).mockImplementation((...parts) => parts.join('/'));

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

      jest.spyOn(global, 'fetch').mockImplementation().mockResolvedValue(mockResponse);

      const result = await generatePoisonedDocument('test doc', 'test goal');

      expect(fetch).toHaveBeenCalledWith(getRemoteGenerationUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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

      jest.spyOn(global, 'fetch').mockImplementation().mockResolvedValue(mockResponse);

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

      jest.mocked(fs.readFileSync).mockReturnValue('test content');
      jest.mocked(path.relative).mockImplementation((from, to) => {
        return 'test.txt';
      });
      jest.mocked(path.dirname).mockReturnValue('output-dir');
      jest.mocked(path.join).mockImplementation((...args) => args.join('/'));

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

      jest.spyOn(global, 'fetch').mockImplementation().mockResolvedValue(mockResponse);

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

      jest.spyOn(global, 'fetch').mockImplementation().mockResolvedValue(mockResponse);

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

      jest.mocked(fs.readFileSync).mockImplementation(() => {
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

      jest.mocked(fs.existsSync).mockImplementation((path) => path === 'test.txt');
      jest.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => false,
      } as fs.Stats);

      jest.mocked(path.relative).mockImplementation((from, to) => 'test.txt');
      jest.mocked(path.dirname).mockReturnValue('output-dir');
      jest.mocked(path.join).mockImplementation((...args) => args.join('/'));

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

      jest.spyOn(global, 'fetch').mockImplementation().mockResolvedValue(mockResponse);

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

      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest
        .mocked(fs.statSync)
        .mockReturnValueOnce({
          isDirectory: () => true,
        } as fs.Stats)
        .mockReturnValue({
          isDirectory: () => false,
        } as fs.Stats);

      jest.mocked(fs.readdirSync).mockReturnValueOnce(['file1.txt'] as any);
      jest.mocked(path.join).mockImplementation((...parts) => parts.join('/'));
      jest.mocked(path.relative).mockImplementation((from, to) => 'file1.txt');
      jest.mocked(path.dirname).mockReturnValue('output-dir');

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

      jest.spyOn(global, 'fetch').mockImplementation().mockResolvedValue(mockResponse);

      await doPoisonDocuments(options);

      expect(fs.mkdirSync).toHaveBeenCalledWith('output-dir', { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith('output.yaml', expect.any(String));
    });
  });
});
