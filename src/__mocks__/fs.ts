import type { PathLike } from 'fs';

const mockFiles: { [key: string]: string } = {};

// Mock fs module
const mockFs = {
  // Required for native module loading
  native: true,
  constants: {
    F_OK: 0,
    R_OK: 4,
    W_OK: 2,
    X_OK: 1
  },
  promises: {},
  // Mock implementations with native property
  realpathSync: Object.assign(jest.fn(), { native: true }),
  statSync: Object.assign(jest.fn().mockImplementation((path: PathLike) => {
    const pathStr = path.toString();
    const isDir = pathStr.endsWith('/') || Object.keys(mockFiles).some(file => file.startsWith(pathStr + '/'));
    return {
      isFile: () => !isDir && pathStr in mockFiles,
      isDirectory: () => isDir || pathStr === '/tmp' || pathStr === '/mock' || pathStr === '/mock/config' || pathStr === '/mock/config/dir',
      isBlockDevice: () => false,
      size: mockFiles[pathStr]?.length || 0,
      mode: 0o666,
      uid: 0,
      gid: 0,
      atime: new Date(),
      mtime: new Date(),
      ctime: new Date(),
      birthtime: new Date()
    };
  }), { native: true }),
  lstatSync: Object.assign(jest.fn(), { native: true }),
  readdir: Object.assign(jest.fn(), { native: true }),
  readlinkSync: Object.assign(jest.fn(), { native: true }),
  createWriteStream: Object.assign(jest.fn().mockImplementation((path: PathLike) => ({
    write: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    emit: jest.fn(),
    close: jest.fn()
  })), { native: true }),
  mkdir: Object.assign(jest.fn().mockImplementation((path: PathLike, options: any, callback?: (err: NodeJS.ErrnoException | null) => void) => {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    const pathStr = path.toString();
    mockFiles[pathStr] = '';
    callback?.(null);
  }), { native: true }),
  stat: Object.assign(jest.fn().mockImplementation((path: PathLike, callback?: (err: NodeJS.ErrnoException | null, stats: any) => void) => {
    const pathStr = path.toString();
    const isDir = pathStr.endsWith('/') || Object.keys(mockFiles).some(file => file.startsWith(pathStr + '/'));
    const stats = {
      isFile: () => !isDir && pathStr in mockFiles,
      isDirectory: () => isDir || pathStr === '/tmp' || pathStr === '/mock' || pathStr === '/mock/config' || pathStr === '/mock/config/dir',
      isBlockDevice: () => false,
      size: mockFiles[pathStr]?.length || 0,
      mode: 0o666,
      uid: 0,
      gid: 0,
      atime: new Date(),
      mtime: new Date(),
      ctime: new Date(),
      birthtime: new Date()
    };

    if (callback) {
      if (!stats.isDirectory() && !(pathStr in mockFiles)) {
        callback(new Error(`ENOENT: no such file or directory, stat '${path}'`), null);
        return;
      }
      callback(null, stats);
      return;
    }

    if (!stats.isDirectory() && !(pathStr in mockFiles)) {
      throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
    }
    return stats;
  }), { native: true }),
  existsSync: Object.assign(jest.fn().mockImplementation((path: PathLike) => {
    const pathStr = path.toString();
    return pathStr in mockFiles || pathStr === '/tmp' || pathStr === '/mock' || pathStr === '/mock/config' || pathStr === '/mock/config/dir';
  }), { native: true }),
  readFileSync: Object.assign(jest.fn().mockImplementation((path: PathLike, options?: { encoding?: string; flag?: string } | string) => {
    const content = mockFiles[path.toString()];
    if (content === undefined) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }
    return content;
  }), { native: true }),
  mkdirSync: Object.assign(jest.fn().mockImplementation((path: PathLike, options?: { recursive?: boolean }) => {
    const pathStr = path.toString();
    if (!pathStr.endsWith('/')) {
      mockFiles[pathStr] = '';
    }
    return undefined;
  }), { native: true }),
  writeFileSync: Object.assign(jest.fn().mockImplementation((path: PathLike, content: string | Buffer) => {
    mockFiles[path.toString()] = content.toString();
  }), { native: true }),
  unlinkSync: Object.assign(jest.fn().mockImplementation((path: PathLike) => {
    const pathStr = path.toString();
    if (!(pathStr in mockFiles)) {
      throw new Error(`ENOENT: no such file or directory, unlink '${path}'`);
    }
    delete mockFiles[pathStr];
  }), { native: true }),
  readdirSync: Object.assign(jest.fn().mockImplementation((path: PathLike) => {
    const pathStr = path.toString();
    const files = Object.keys(mockFiles)
      .filter(file => file.startsWith(pathStr))
      .map(file => file.slice(pathStr.endsWith('/') ? pathStr.length : pathStr.length + 1));
    return files;
  }), { native: true }),
  __setMockFileContent: (path: string, content: string) => {
    mockFiles[path] = content;
  },
  __clearMockFiles: () => {
    Object.keys(mockFiles).forEach(key => delete mockFiles[key]);
  },
  __getMockFiles: () => ({ ...mockFiles }),
};

module.exports = mockFs;
