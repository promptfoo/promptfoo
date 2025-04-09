import { Command } from 'commander';
import {
  createAndDisplayShareableUrl,
  notCloudEnabledShareInstructions,
  shareCommand,
} from '../../src/commands/share';
import * as envars from '../../src/envars';
import logger from '../../src/logger';
import Eval from '../../src/models/eval';
import { createShareableUrl, isSharingEnabled } from '../../src/share';

jest.mock('../../src/share');
jest.mock('../../src/logger');
jest.mock('../../src/telemetry', () => ({
  record: jest.fn(),
  send: jest.fn(),
}));
jest.mock('../../src/envars');
jest.mock('readline');
jest.mock('../../src/models/eval');
jest.mock('../../src/util', () => ({
  setupEnv: jest.fn(),
}));

describe('Share Command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.exitCode = 0; // Reset exitCode before each test
  });

  describe('notCloudEnabledShareInstructions', () => {
    it('should log instructions for cloud setup', () => {
      notCloudEnabledShareInstructions();

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('You need to have a cloud account'),
      );
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Please go to'));
    });
  });

  describe('createAndDisplayShareableUrl', () => {
    it('should return a URL and log it when successful', async () => {
      jest.mocked(isSharingEnabled).mockReturnValue(true);
      const mockEval = { id: 'test-eval-id' } as Eval;
      const mockUrl = 'https://app.promptfoo.dev/eval/test-eval-id';

      jest.mocked(createShareableUrl).mockResolvedValue(mockUrl);

      const result = await createAndDisplayShareableUrl(mockEval, false);

      expect(createShareableUrl).toHaveBeenCalledWith(mockEval, false);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(mockUrl));
      expect(result).toBe(mockUrl);
    });

    it('should pass showAuth parameter correctly', async () => {
      const mockEval = { id: 'test-eval-id' } as Eval;
      const mockUrl = 'https://app.promptfoo.dev/eval/test-eval-id';

      jest.mocked(createShareableUrl).mockResolvedValue(mockUrl);

      await createAndDisplayShareableUrl(mockEval, true);

      expect(createShareableUrl).toHaveBeenCalledWith(mockEval, true);
    });

    it('should show cloud instructions and return null when sharing is not enabled', async () => {
      const mockEval = { id: 'test-eval-id' } as Eval;
      jest.mocked(isSharingEnabled).mockReturnValue(false);

      const result = await createAndDisplayShareableUrl(mockEval, false);

      expect(result).toBeNull();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('You need to have a cloud account'),
      );
      expect(process.exitCode).toBe(1);
    });

    it('should return null when createShareableUrl returns null', async () => {
      const mockEval = { id: 'test-eval-id' } as Eval;

      jest.mocked(isSharingEnabled).mockReturnValue(true);
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
      expect(options?.find((o) => o.long === '--show-auth')).toBeDefined();
      expect(options?.find((o) => o.long === '--env-path')).toBeDefined();
      expect(options?.find((o) => o.long === '--yes')).toBeDefined();
    });

    it('should handle specific evalId not found', async () => {
      jest.spyOn(Eval, 'findById').mockImplementation().mockResolvedValue(undefined);

      const shareCmd = program.commands.find((c) => c.name() === 'share');
      await shareCmd?.parseAsync(['node', 'test', 'non-existent-id']);

      expect(Eval.findById).toHaveBeenCalledWith('non-existent-id');
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Could not find eval with ID'),
      );
      expect(process.exitCode).toBe(1);
    });

    it('should handle no evals available', async () => {
      jest.spyOn(Eval, 'latest').mockImplementation().mockResolvedValue(undefined);

      const shareCmd = program.commands.find((c) => c.name() === 'share');
      await shareCmd?.parseAsync(['node', 'test']);

      expect(Eval.latest).toHaveBeenCalledWith();
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Could not load results'));
      expect(process.exitCode).toBe(1);
    });

    it('should handle eval with empty prompts', async () => {
      const mockEval = { prompts: [] } as unknown as Eval;
      jest.spyOn(Eval, 'latest').mockImplementation().mockResolvedValue(mockEval);

      const shareCmd = program.commands.find((c) => c.name() === 'share');
      await shareCmd?.parseAsync(['node', 'test']);

      expect(Eval.latest).toHaveBeenCalledWith();
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('cannot be shared'));
      expect(process.exitCode).toBe(1);
    });

    it('should accept -y flag for backwards compatibility', async () => {
      const mockEval = { prompts: ['test'] } as unknown as Eval;

      jest.spyOn(Eval, 'latest').mockImplementation().mockResolvedValue(mockEval);
      jest.mocked(isSharingEnabled).mockReturnValue(true);
      jest.mocked(createShareableUrl).mockResolvedValue('https://example.com/share');

      const shareCmd = program.commands.find((c) => c.name() === 'share');
      await shareCmd?.parseAsync(['node', 'test', '-y']);

      expect(Eval.latest).toHaveBeenCalledWith();
      expect(createShareableUrl).toHaveBeenCalledWith(mockEval, false);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('View results:'));
    });

    it('should use promptfoo.app by default if no environment variables are set', () => {
      jest.mocked(envars.getEnvString).mockImplementation(() => '');

      const baseUrl =
        envars.getEnvString('PROMPTFOO_SHARING_APP_BASE_URL') ||
        envars.getEnvString('PROMPTFOO_REMOTE_APP_BASE_URL');
      const hostname = baseUrl ? new URL(baseUrl).hostname : 'promptfoo.app';

      expect(hostname).toBe('promptfoo.app');
    });

    it('should use PROMPTFOO_SHARING_APP_BASE_URL for hostname when set', () => {
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
