import * as util from '../../src/util';
import { getCommand, getCommandPrefix } from '../../src/util/command';

jest.mock('../../src/util', () => ({
  isRunningUnderNpx: jest.fn(),
}));

const mockedIsRunningUnderNpx = jest.mocked(util.isRunningUnderNpx);

describe('command utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCommandPrefix', () => {
    it('returns "promptfoo" when not running under npx', () => {
      mockedIsRunningUnderNpx.mockReturnValue(false);
      expect(getCommandPrefix()).toBe('promptfoo');
    });

    it('returns "npx promptfoo" when running under npx', () => {
      mockedIsRunningUnderNpx.mockReturnValue(true);
      expect(getCommandPrefix()).toBe('npx promptfoo');
    });

    it('returns "npx promptfoo@latest" when running under npx with latest flag', () => {
      mockedIsRunningUnderNpx.mockReturnValue(true);
      expect(getCommandPrefix(true)).toBe('npx promptfoo@latest');
    });

    it('returns "promptfoo" when not running under npx with latest flag', () => {
      mockedIsRunningUnderNpx.mockReturnValue(false);
      expect(getCommandPrefix(true)).toBe('promptfoo');
    });
  });

  describe('getCommand', () => {
    it('returns full command when not running under npx', () => {
      mockedIsRunningUnderNpx.mockReturnValue(false);
      expect(getCommand('eval')).toBe('promptfoo eval');
      expect(getCommand('redteam init')).toBe('promptfoo redteam init');
    });

    it('returns full command with npx prefix when running under npx', () => {
      mockedIsRunningUnderNpx.mockReturnValue(true);
      expect(getCommand('eval')).toBe('npx promptfoo eval');
      expect(getCommand('redteam init')).toBe('npx promptfoo redteam init');
    });

    it('returns full command with npx@latest when latest flag is set', () => {
      mockedIsRunningUnderNpx.mockReturnValue(true);
      expect(getCommand('init', true)).toBe('npx promptfoo@latest init');
    });
  });
});
