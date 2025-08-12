import {
  checkMonthlyProbeLimit,
  formatProbeUsageMessage,
  getMonthlyRedteamProbeUsage,
} from '../../src/util/redteamProbeLimit';
import { getDb } from '../../src/database';

jest.mock('../../src/database', () => ({
  getDb: jest.fn(),
}));

jest.mock('../../src/logger', () => {
  const mockLogger = {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  };
  return {
    __esModule: true,
    default: mockLogger,
  };
});

describe('redteamProbeLimit', () => {
  const mockDb = {
    select: jest.fn(),
    from: jest.fn(),
    where: jest.fn(),
    all: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getDb as jest.Mock).mockReturnValue(mockDb);

    // Setup chained mock methods
    mockDb.select.mockReturnValue(mockDb);
    mockDb.from.mockReturnValue(mockDb);
    mockDb.where.mockReturnValue(mockDb);
    mockDb.all.mockReturnValue([]);
  });

  describe('getMonthlyRedteamProbeUsage', () => {
    it('should return 0 when no redteam evals exist', async () => {
      mockDb.all.mockReturnValue([]);

      const usage = await getMonthlyRedteamProbeUsage();
      expect(usage).toBe(0);
    });

    it('should sum numRequests from all redteam prompts', async () => {
      mockDb.all.mockReturnValue([
        {
          prompts: [
            { metrics: { tokenUsage: { numRequests: 100 } } },
            { metrics: { tokenUsage: { numRequests: 200 } } },
          ],
        },
        {
          prompts: [{ metrics: { tokenUsage: { numRequests: 300 } } }],
        },
      ]);

      const usage = await getMonthlyRedteamProbeUsage();
      expect(usage).toBe(600);
    });

    it('should handle missing tokenUsage data gracefully', async () => {
      mockDb.all.mockReturnValue([
        {
          prompts: [{ metrics: {} }, { metrics: { tokenUsage: { numRequests: 100 } } }, {}],
        },
      ]);

      const usage = await getMonthlyRedteamProbeUsage();
      expect(usage).toBe(100);
    });
  });

  describe('checkMonthlyProbeLimit', () => {
    it('should indicate when limit is not exceeded', async () => {
      mockDb.all.mockReturnValue([
        {
          prompts: [{ metrics: { tokenUsage: { numRequests: 10000 } } }],
        },
      ]);

      const status = await checkMonthlyProbeLimit();
      expect(status.hasExceeded).toBe(false);
      expect(status.usedProbes).toBe(10000);
      expect(status.remainingProbes).toBe(40000);
      expect(status.limit).toBe(50000);
    });

    it('should indicate when limit is exceeded', async () => {
      mockDb.all.mockReturnValue([
        {
          prompts: [{ metrics: { tokenUsage: { numRequests: 50001 } } }],
        },
      ]);

      const status = await checkMonthlyProbeLimit();
      expect(status.hasExceeded).toBe(true);
      expect(status.usedProbes).toBe(50001);
      expect(status.remainingProbes).toBe(0);
      expect(status.limit).toBe(50000);
    });
  });

  describe('formatProbeUsageMessage', () => {
    it('should format message when limit is reached', () => {
      const message = formatProbeUsageMessage(0);
      expect(message).toContain('Monthly redteam probe limit reached');
      expect(message).toContain('50,000');
    });

    it('should format warning message when probes are low', () => {
      const message = formatProbeUsageMessage(2000);
      expect(message).toContain('Low on probes');
      expect(message).toContain('2,000');
      expect(message).toContain('4.0%');
    });

    it('should format info message when probes are sufficient', () => {
      const message = formatProbeUsageMessage(30000);
      expect(message).toContain('Redteam probes remaining');
      expect(message).toContain('30,000');
      expect(message).toContain('60.0%');
    });
  });
});
