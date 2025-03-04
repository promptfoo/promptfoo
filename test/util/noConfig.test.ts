import confirm from '@inquirer/confirm';
import { isCI } from '../../src/envars';
import logger from '../../src/logger';
import { initializeProject } from '../../src/onboarding';
import { isRunningUnderNpx } from '../../src/util';
import { handleNoConfiguration } from '../../src/util/noConfig';

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
    it('should suggest commands and exit when user declines initialization', async () => {
      // Arrange
      jest.mocked(confirm).mockResolvedValue(false);
      jest.mocked(isRunningUnderNpx).mockReturnValue(false);

      // Act & Assert
      await expect(handleNoConfiguration()).rejects.toThrow('Test exited with code 1');

      // Verify interactions
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('No promptfooconfig found'));
      expect(confirm).toHaveBeenCalledWith({
        message: 'Would you like to initialize a new project?',
        default: true,
      });
      expect(initializeProject).not.toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should initialize project and exit with 0 when user confirms', async () => {
      // Arrange
      jest.mocked(confirm).mockResolvedValue(true);
      jest.mocked(isRunningUnderNpx).mockReturnValue(false);

      // Act & Assert
      await expect(handleNoConfiguration()).rejects.toThrow('Test exited with code 0');

      // Verify interactions
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('No promptfooconfig found'));
      expect(confirm).toHaveBeenCalledWith({
        message: 'Would you like to initialize a new project?',
        default: true,
      });
      expect(initializeProject).toHaveBeenCalledWith(null, true);
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('should show npx command when running under npx', async () => {
      // Arrange
      jest.mocked(confirm).mockResolvedValue(false);
      jest.mocked(isRunningUnderNpx).mockReturnValue(true);

      // Act & Assert
      await expect(handleNoConfiguration()).rejects.toThrow('Test exited with code 1');

      // Verify interactions
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('npx promptfoo eval'));
    });

    it('should handle CI environments appropriately', async () => {
      // Arrange
      jest.mocked(confirm).mockResolvedValue(false);
      jest.mocked(isRunningUnderNpx).mockReturnValue(false);
      jest.mocked(isCI).mockReturnValue(true);

      // Act & Assert
      await expect(handleNoConfiguration()).rejects.toThrow('Test exited with code 1');

      // Verify interactions - in CI mode, it should still show the warning but not try to initialize
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('No promptfooconfig found'));
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(initializeProject).not.toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});
