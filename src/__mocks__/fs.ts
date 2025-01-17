import type { PathLike } from 'fs';

const mockFiles: { [key: string]: string } = {};

const mockFs = {
  existsSync: jest.fn().mockImplementation((path: PathLike) => {
    return path.toString() in mockFiles;
  }),
  readFileSync: jest.fn().mockImplementation((path: PathLike) => {
    const content = mockFiles[path.toString()];
    if (content === undefined) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }
    return content;
  }),
  mkdirSync: jest.fn().mockImplementation(() => undefined),
  writeFileSync: jest.fn().mockImplementation((path: PathLike, content: string) => {
    mockFiles[path.toString()] = content;
  }),
  unlinkSync: jest.fn().mockImplementation((path: PathLike) => {
    const pathStr = path.toString();
    if (!(pathStr in mockFiles)) {
      throw new Error(`ENOENT: no such file or directory, unlink '${path}'`);
    }
    delete mockFiles[pathStr];
  }),
  readdirSync: jest.fn().mockImplementation((path: PathLike) => {
    const pathStr = path.toString();
    const files = Object.keys(mockFiles)
      .filter(file => file.startsWith(pathStr))
      .map(file => file.slice(pathStr.endsWith('/') ? pathStr.length : pathStr.length + 1));
    return files;
  }),
  statSync: jest.fn().mockImplementation((path: PathLike) => ({
    isFile: () => path.toString() in mockFiles,
    isDirectory: () => false,
    isBlockDevice: () => false,
    size: 0,
    mode: 0o666,
    uid: 0,
    gid: 0,
    atime: new Date(),
    mtime: new Date(),
    ctime: new Date(),
    birthtime: new Date(),
  })),
  __setMockFileContent: (path: string, content: string) => {
    mockFiles[path] = content;
  },
  __clearMockFiles: () => {
    Object.keys(mockFiles).forEach(key => delete mockFiles[key]);
  }
};

module.exports = mockFs;
