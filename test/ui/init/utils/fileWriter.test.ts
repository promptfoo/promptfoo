import * as fs from 'fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkExistingFiles,
  ensureDirectory,
  isWritable,
  writeFiles,
} from '../../../../src/ui/init/utils/fileWriter';

import type { FileToWrite } from '../../../../src/ui/init/machines/initMachine.types';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  accessSync: vi.fn(),
  constants: {
    W_OK: 2,
  },
}));

describe('checkExistingFiles', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should mark files that exist', async () => {
    vi.mocked(fs.existsSync).mockImplementation((filePath) => {
      return String(filePath).includes('existing.yaml');
    });

    const files: FileToWrite[] = [
      {
        path: '/test/existing.yaml',
        relativePath: 'existing.yaml',
        content: 'test',
        exists: false,
        overwrite: true,
      },
      {
        path: '/test/new.yaml',
        relativePath: 'new.yaml',
        content: 'test',
        exists: false,
        overwrite: true,
      },
    ];

    const result = await checkExistingFiles(files);

    expect(result[0].exists).toBe(true);
    expect(result[1].exists).toBe(false);
  });

  it('should preserve original content and paths', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const files: FileToWrite[] = [
      {
        path: '/test/file.yaml',
        relativePath: 'file.yaml',
        content: 'original content',
        exists: false,
        overwrite: true,
      },
    ];

    const result = await checkExistingFiles(files);

    expect(result[0].content).toBe('original content');
    expect(result[0].path).toBe('/test/file.yaml');
    expect(result[0].relativePath).toBe('file.yaml');
  });

  it('should handle empty file list', async () => {
    const result = await checkExistingFiles([]);
    expect(result).toEqual([]);
  });
});

describe('writeFiles', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
  });

  it('should write all files with overwrite=true', async () => {
    const files: FileToWrite[] = [
      {
        path: '/test/file1.yaml',
        relativePath: 'file1.yaml',
        content: 'content1',
        exists: false,
        overwrite: true,
      },
      {
        path: '/test/file2.yaml',
        relativePath: 'file2.yaml',
        content: 'content2',
        exists: false,
        overwrite: true,
      },
    ];

    const result = await writeFiles(files);

    expect(result.success).toBe(true);
    expect(result.filesWritten).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
    expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
  });

  it('should skip files with overwrite=false that exist', async () => {
    const files: FileToWrite[] = [
      {
        path: '/test/existing.yaml',
        relativePath: 'existing.yaml',
        content: 'content',
        exists: true,
        overwrite: false,
      },
      {
        path: '/test/new.yaml',
        relativePath: 'new.yaml',
        content: 'content',
        exists: false,
        overwrite: true,
      },
    ];

    const result = await writeFiles(files);

    expect(result.success).toBe(true);
    expect(result.filesWritten).toHaveLength(1);
    expect(result.filesSkipped).toHaveLength(1);
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
  });

  it('should create parent directories', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const files: FileToWrite[] = [
      {
        path: '/test/nested/dir/file.yaml',
        relativePath: 'nested/dir/file.yaml',
        content: 'content',
        exists: false,
        overwrite: true,
      },
    ];

    await writeFiles(files);

    expect(fs.mkdirSync).toHaveBeenCalled();
    const mkdirCall = vi.mocked(fs.mkdirSync).mock.calls[0];
    expect(mkdirCall[1]).toEqual({ recursive: true });
  });

  it('should call onFileWritten callback', async () => {
    const onFileWritten = vi.fn();

    const files: FileToWrite[] = [
      {
        path: '/test/file.yaml',
        relativePath: 'file.yaml',
        content: 'content',
        exists: false,
        overwrite: true,
      },
    ];

    await writeFiles(files, { onFileWritten });

    expect(onFileWritten).toHaveBeenCalledWith('/test/file.yaml');
  });

  it('should handle write errors', async () => {
    vi.mocked(fs.writeFileSync).mockImplementation(() => {
      throw new Error('Permission denied');
    });

    const files: FileToWrite[] = [
      {
        path: '/test/file.yaml',
        relativePath: 'file.yaml',
        content: 'content',
        exists: false,
        overwrite: true,
      },
    ];

    const result = await writeFiles(files);

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain('Permission denied');
  });

  it('should handle empty file list', async () => {
    const result = await writeFiles([]);

    expect(result.success).toBe(true);
    expect(result.filesWritten).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should continue writing other files after one fails', async () => {
    let callCount = 0;
    vi.mocked(fs.writeFileSync).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        throw new Error('First file failed');
      }
    });

    const files: FileToWrite[] = [
      {
        path: '/test/file1.yaml',
        relativePath: 'file1.yaml',
        content: 'content1',
        exists: false,
        overwrite: true,
      },
      {
        path: '/test/file2.yaml',
        relativePath: 'file2.yaml',
        content: 'content2',
        exists: false,
        overwrite: true,
      },
    ];

    const result = await writeFiles(files);

    expect(result.success).toBe(false);
    expect(result.filesWritten).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
  });
});

describe('ensureDirectory', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should create directory if it does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);

    ensureDirectory('/test/path');

    expect(fs.mkdirSync).toHaveBeenCalledWith('/test/path', { recursive: true });
  });

  it('should not create directory if it exists', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    ensureDirectory('/test/path');

    expect(fs.mkdirSync).not.toHaveBeenCalled();
  });
});

describe('isWritable', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return true for writable directory', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
    vi.mocked(fs.unlinkSync).mockReturnValue(undefined);

    expect(isWritable('/test/path')).toBe(true);
  });

  it('should return false for non-writable directory', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.writeFileSync).mockImplementation(() => {
      throw new Error('Permission denied');
    });

    expect(isWritable('/test/path')).toBe(false);
  });

  it('should create directory if it does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
    vi.mocked(fs.unlinkSync).mockReturnValue(undefined);

    isWritable('/test/new-path');

    expect(fs.mkdirSync).toHaveBeenCalledWith('/test/new-path', { recursive: true });
  });
});
