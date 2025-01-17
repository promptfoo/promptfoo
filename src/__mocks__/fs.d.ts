import type { PathLike, Stats } from 'fs';

declare const mockFs: {
  existsSync: jest.Mock<boolean, [PathLike]>;
  readFileSync: jest.Mock<string, [PathLike, (string | { encoding?: BufferEncoding; flag?: string }) | undefined]>;
  mkdirSync: jest.Mock<void, [PathLike, { recursive?: boolean } | undefined]>;
  writeFileSync: jest.Mock<void, [PathLike, string | Buffer]>;
  unlinkSync: jest.Mock<void, [PathLike]>;
  readdirSync: jest.Mock<string[], [PathLike]>;
  statSync: jest.Mock<Partial<Stats>, [PathLike]>;
  __setMockFileContent: (path: string, content: string) => void;
  __clearMockFiles: () => void;
  __getMockFiles: () => { [key: string]: string };
  native: boolean;
};

export = mockFs;
