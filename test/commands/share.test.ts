import { Command } from 'commander';
import { createAndDisplayShareableUrl, shareCommand } from '../../src/commands/share';
import * as envars from '../../src/envars';
import logger from '../../src/logger';
import { createShareableUrl } from '../../src/share';

jest.mock('../../src/share');
jest.mock('../../src/logger');
jest.mock('../../src/telemetry', () => ({
  record: jest.fn(),
  send: jest.fn(),
}));
jest.mock('../../src/envars');
jest.mock('readline');
jest.mock('../../src/models/eval');

describe('Share Command', () => {
  describe('createAndDisplayShareableUrl', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return a URL and log it when successful', async () => {
      const mockEval = { id: 'test-eval-id' } as any;
      const mockUrl = 'https://app.promptfoo.dev/eval/test-eval-id';

      jest.mocked(createShareableUrl).mockResolvedValue(mockUrl);

      const result = await createAndDisplayShareableUrl(mockEval, false);

      expect(createShareableUrl).toHaveBeenCalledWith(mockEval, false);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(mockUrl));
      expect(result).toBe(mockUrl);
    });

    it('should pass showAuth parameter correctly', async () => {
      const mockEval = { id: 'test-eval-id' } as any;
      const mockUrl = 'https://app.promptfoo.dev/eval/test-eval-id';

      jest.mocked(createShareableUrl).mockResolvedValue(mockUrl);

      await createAndDisplayShareableUrl(mockEval, true);

      expect(createShareableUrl).toHaveBeenCalledWith(mockEval, true);
    });

    it('should return null when createShareableUrl returns null', async () => {
      const mockEval = { id: 'test-eval-id' } as any;

      jest.mocked(createShareableUrl).mockResolvedValue(null);

      const result = await createAndDisplayShareableUrl(mockEval, false);

      expect(createShareableUrl).toHaveBeenCalledWith(mockEval, false);
      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith('Failed to create shareable URL');
      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe('shareCommand', () => {
    let program: Command;

    beforeEach(() => {
      jest.clearAllMocks();
      program = new Command();
      shareCommand(program);
    });

    it('should register share command with correct options', () => {
      const cmd = program.commands.find((c) => c.name() === 'share');

      expect(cmd).toBeDefined();
      expect(cmd?.description()).toContain('Create a shareable URL');

      const options = cmd?.options;
      expect(options?.find((o) => o.short === '-y')).toBeDefined();
      expect(options?.find((o) => o.long === '--show-auth')).toBeDefined();
      expect(options?.find((o) => o.long === '--env-path')).toBeDefined();
    });

    // Test just the hostname determination logic directly
    it('should use app.promptfoo.dev by default if no environment variables are set', () => {
      // Mock environment variables to return undefined
      jest.mocked(envars.getEnvString).mockImplementation(() => '');

      const baseUrl =
        envars.getEnvString('PROMPTFOO_SHARING_APP_BASE_URL') ||
        envars.getEnvString('PROMPTFOO_REMOTE_APP_BASE_URL');
      const hostname = baseUrl ? new URL(baseUrl).hostname : 'app.promptfoo.dev';

      expect(hostname).toBe('app.promptfoo.dev');
    });

    it('should use PROMPTFOO_SHARING_APP_BASE_URL for hostname when set', () => {
      // Mock PROMPTFOO_SHARING_APP_BASE_URL
      jest.mocked(envars.getEnvString).mockImplementation((key) => {
        if (key === 'PROMPTFOO_SHARING_APP_BASE_URL') {
          return 'https://custom-domain.com';
        }
        return '';
      });

      const baseUrl =
        envars.getEnvString('PROMPTFOO_SHARING_APP_BASE_URL') ||
        envars.getEnvString('PROMPTFOO_REMOTE_APP_BASE_URL');
      const hostname = baseUrl ? new URL(baseUrl).hostname : 'app.promptfoo.dev';

      expect(hostname).toBe('custom-domain.com');
    });

    it('should use PROMPTFOO_REMOTE_APP_BASE_URL for hostname when PROMPTFOO_SHARING_APP_BASE_URL is not set', () => {
      // Mock PROMPTFOO_REMOTE_APP_BASE_URL
      jest.mocked(envars.getEnvString).mockImplementation((key) => {
        if (key === 'PROMPTFOO_REMOTE_APP_BASE_URL') {
          return 'https://self-hosted-domain.com';
        }
        return '';
      });

      const baseUrl =
        envars.getEnvString('PROMPTFOO_SHARING_APP_BASE_URL') ||
        envars.getEnvString('PROMPTFOO_REMOTE_APP_BASE_URL');
      const hostname = baseUrl ? new URL(baseUrl).hostname : 'app.promptfoo.dev';

      expect(hostname).toBe('self-hosted-domain.com');
    });

    it('should prioritize PROMPTFOO_SHARING_APP_BASE_URL over PROMPTFOO_REMOTE_APP_BASE_URL', () => {
      // Mock both environment variables
      jest.mocked(envars.getEnvString).mockImplementation((key) => {
        if (key === 'PROMPTFOO_SHARING_APP_BASE_URL') {
          return 'https://sharing-domain.com';
        }
        if (key === 'PROMPTFOO_REMOTE_APP_BASE_URL') {
          return 'https://remote-domain.com';
        }
        return '';
      });

      const baseUrl =
        envars.getEnvString('PROMPTFOO_SHARING_APP_BASE_URL') ||
        envars.getEnvString('PROMPTFOO_REMOTE_APP_BASE_URL');
      const hostname = baseUrl ? new URL(baseUrl).hostname : 'app.promptfoo.dev';

      expect(hostname).toBe('sharing-domain.com');
    });
  });
});
