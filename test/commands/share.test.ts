import { Command } from 'commander';
import { createAndDisplayShareableUrl, shareCommand } from '../../src/commands/share';
import logger from '../../src/logger';
import type Eval from '../../src/models/eval';
import { createShareableUrl } from '../../src/share';

jest.mock('../../src/share');
jest.mock('../../src/logger');
jest.mock('../../src/telemetry', () => ({
  record: jest.fn(),
  send: jest.fn(),
}));

describe('Share Command', () => {
  describe('createAndDisplayShareableUrl', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return a URL and log it when successful', async () => {
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

    it('should return null when createShareableUrl returns null', async () => {
      const mockEval = { id: 'test-eval-id' } as Eval;

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
  });
});
