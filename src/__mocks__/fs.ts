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
    X_OK: 1,
  },
  promises: {},
  // Mock implementations with native property
  realpathSync: Object.assign(jest.fn(), { native: true }),
  statSync: Object.assign(jest.fn().mockImplementation((path: PathLike) => ({
    isFile: () => path.toString() in mockFiles,
    isDirectory: () => false,
    isBlockDevice: () => false,
    size: mockFiles[path.toString()]?.length || 0,
    mode: 0o666,
    uid: 0,
    gid: 0,
    atime: new Date(),
    mtime: new Date(),
    ctime: new Date(),
    birthtime: new Date(),
  })), { native: true }),
  lstatSync: Object.assign(jest.fn(), { native: true }),
  readdir: Object.assign(jest.fn(), { native: true }),
  readlinkSync: Object.assign(jest.fn(), { native: true }),
  existsSync: Object.assign(jest.fn().mockImplementation((path: PathLike) => {
    return path.toString() in mockFiles;
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
