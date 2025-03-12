import path from 'path';
import { importModule } from '../src/esm';
import logger from '../src/logger';

jest.mock('../src/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

describe('ESM utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('importModule', () => {
    it('imports JavaScript modules', async () => {
      const modulePath = path.resolve(__dirname, 'fixtures/testModule.js');

      // Mock the file system module
      jest.mock('fs', () => ({
        existsSync: jest.fn().mockReturnValue(true),
        readFileSync: jest
          .fn()
          .mockReturnValue('module.exports = { testFunction: () => "test result" }'),
      }));

      // Mock the module
      jest.doMock(
        modulePath,
        () => ({
          default: { testFunction: () => 'test result' },
        }),
        { virtual: true },
      );

      const result = await importModule(modulePath);
      expect(result).toEqual({ testFunction: expect.any(Function) });
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Successfully required module'),
      );
    });

    it('imports TypeScript modules', async () => {
      const modulePath = path.resolve(__dirname, 'fixtures/testModule.ts');
      jest.doMock(
        modulePath,
        () => ({
          default: { testFunction: () => 'test result' },
        }),
        { virtual: true },
      );

      const result = await importModule(modulePath);
      expect(result).toEqual({ testFunction: expect.any(Function) });
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('TypeScript/ESM module detected'),
      );
    });

    it('handles absolute paths', async () => {
      const absolutePath = path.resolve('/absolute/path/module.js');
      jest.doMock(
        absolutePath,
        () => ({
          default: { testFunction: () => 'absolute path result' },
        }),
        { virtual: true },
      );

      const result = await importModule(absolutePath);
      expect(result).toEqual({ testFunction: expect.any(Function) });
    });
  });
});
