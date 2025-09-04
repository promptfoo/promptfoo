import {
  checkMonthlyProbeLimit,
  formatProbeUsageMessage,
  getMonthlyRedteamProbeUsage,
} from '../../src/util/redteamProbeLimit';
import { getDb } from '../../src/database';
import { isEnterpriseCustomer } from '../../src/util/cloud';
import { MONTHLY_PROBE_LIMIT } from '../../src/redteam/constants';

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

jest.mock('../../src/util/cloud', () => ({
  isEnterpriseCustomer: jest.fn(),
}));

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
    (isEnterpriseCustomer as jest.Mock).mockResolvedValue(false);

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
      const usedProbes = Math.floor(MONTHLY_PROBE_LIMIT * 0.5); // Use 50% of limit
      mockDb.all.mockReturnValue([
        {
          prompts: [{ metrics: { tokenUsage: { numRequests: usedProbes } } }],
        },
      ]);

      const status = await checkMonthlyProbeLimit();
      expect(status.hasExceeded).toBe(false);
      expect(status.usedProbes).toBe(usedProbes);
      expect(status.remainingProbes).toBe(MONTHLY_PROBE_LIMIT - usedProbes);
      expect(status.limit).toBe(MONTHLY_PROBE_LIMIT);
    });

    it('should indicate when limit is exceeded', async () => {
      const usedProbes = MONTHLY_PROBE_LIMIT + 1; // Exceed limit by 1
      mockDb.all.mockReturnValue([
        {
          prompts: [{ metrics: { tokenUsage: { numRequests: usedProbes } } }],
        },
      ]);

      const status = await checkMonthlyProbeLimit();
      expect(status.hasExceeded).toBe(true);
      expect(status.usedProbes).toBe(usedProbes);
      expect(status.remainingProbes).toBe(0);
      expect(status.limit).toBe(MONTHLY_PROBE_LIMIT);
    });
  });

  describe('formatProbeUsageMessage', () => {
    it('should format message when limit is reached', () => {
      const probeStatus = {
        hasExceeded: true,
        usedProbes: MONTHLY_PROBE_LIMIT,
        remainingProbes: 0,
        limit: MONTHLY_PROBE_LIMIT,
        enabled: true,
      };
      const message = formatProbeUsageMessage(probeStatus);
      expect(message).toContain('Monthly redteam probe limit reached');
      expect(message).toContain(MONTHLY_PROBE_LIMIT.toLocaleString());
    });

    it('should format warning message when probes are low', () => {
      const remainingProbes = Math.floor(MONTHLY_PROBE_LIMIT * 0.15); // 15% remaining (< 20% threshold)
      const usedProbes = MONTHLY_PROBE_LIMIT - remainingProbes;
      const probeStatus = {
        hasExceeded: false,
        usedProbes,
        remainingProbes,
        limit: MONTHLY_PROBE_LIMIT,
        enabled: true,
      };
      const message = formatProbeUsageMessage(probeStatus);
      expect(message).toContain('Low on probes');
      expect(message).toContain(remainingProbes.toLocaleString());
      expect(message).toContain('15.0%');
    });

    it('should format info message when probes are sufficient', () => {
      const remainingProbes = Math.floor(MONTHLY_PROBE_LIMIT * 0.6); // 60% remaining (> 20% threshold)
      const usedProbes = MONTHLY_PROBE_LIMIT - remainingProbes;
      const probeStatus = {
        hasExceeded: false,
        usedProbes,
        remainingProbes,
        limit: MONTHLY_PROBE_LIMIT,
        enabled: true,
      };
      const message = formatProbeUsageMessage(probeStatus);
      expect(message).toContain('Redteam probes remaining');
      expect(message).toContain(remainingProbes.toLocaleString());
      expect(message).toContain('60.0%');
    });
  });
});
