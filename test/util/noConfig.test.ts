import { isCI } from '../../src/envars';
import logger from '../../src/logger';
import { isRunningUnderNpx } from '../../src/util';
import { handleNoConfiguration, setProjectInitializer } from '../../src/util/noConfig';

jest.mock('@inquirer/confirm');
jest.mock('../../src/logger');
jest.mock('../../src/onboarding');
jest.mock('../../src/util');
jest.mock('../../src/envars');

describe('noConfig', () => {
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`Test exited with code ${code}`);
    }) as jest.SpyInstance;
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  describe('handleNoConfiguration', () => {
    it('should suggest commands and exit with exit code 1', async () => {
      jest.mocked(isCI).mockReturnValue(false);
      jest.mocked(isRunningUnderNpx).mockReturnValue(true);

      await expect(handleNoConfiguration()).rejects.toThrow('Test exited with code 1');

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('No promptfooconfig found'));
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should include correct command in message when not running under npx', async () => {
      jest.mocked(isCI).mockReturnValue(false);
      jest.mocked(isRunningUnderNpx).mockReturnValue(false);

      await expect(handleNoConfiguration()).rejects.toThrow('Test exited with code 1');

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('promptfoo eval'));
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should include correct command in message when running under npx', async () => {
      jest.mocked(isCI).mockReturnValue(false);
      jest.mocked(isRunningUnderNpx).mockReturnValue(true);

      await expect(handleNoConfiguration()).rejects.toThrow('Test exited with code 1');

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('npx promptfoo eval'));
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('setProjectInitializer', () => {
    it('sets the project initializer correctly', async () => {
      const mockInitializer = jest.fn().mockResolvedValue(undefined);

      setProjectInitializer(mockInitializer);

      expect(() => setProjectInitializer(mockInitializer)).not.toThrow();
    });
  });
});
