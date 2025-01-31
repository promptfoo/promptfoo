interface RedteamStrategy {
  id: string;
  config?: Record<string, any>;
}

function getStrategyId(strategy: string | RedteamStrategy): string {
  return typeof strategy === 'string' ? strategy : strategy.id;
}

describe('Strategies', () => {
  describe('getStrategyId', () => {
    it('should return strategy id when input is string', () => {
      expect(getStrategyId('test')).toBe('test');
    });

    it('should return strategy id when input is object', () => {
      const strategy: RedteamStrategy = {
        id: 'test',
        config: {},
      };
      expect(getStrategyId(strategy)).toBe('test');
    });

    it('should handle empty string', () => {
      expect(getStrategyId('')).toBe('');
    });

    it('should handle strategy object without config', () => {
      const strategy: RedteamStrategy = { id: 'test' };
      expect(getStrategyId(strategy)).toBe('test');
    });
  });
});
