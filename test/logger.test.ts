import {
  setLogCallback,
  getLogLevel,
  setLogLevel,
  LOG_LEVELS,
  globalLogCallback,
} from '../src/logger';

describe('logger', () => {
  beforeEach(() => {
    setLogCallback(null);
  });

  describe('setLogCallback', () => {
    it('should set the global log callback', () => {
      const callback = jest.fn();
      setLogCallback(callback);
      expect(globalLogCallback).toBe(callback);
    });

    it('should allow setting null callback', () => {
      setLogCallback(null);
      expect(globalLogCallback).toBeNull();
    });
  });

  describe('getLogLevel', () => {
    it('should return current log level', () => {
      const level = getLogLevel();
      expect(Object.keys(LOG_LEVELS)).toContain(level);
    });
  });

  describe('setLogLevel', () => {
    it('should set valid log levels', () => {
      setLogLevel('debug');
      expect(getLogLevel()).toBe('debug');

      setLogLevel('info');
      expect(getLogLevel()).toBe('info');

      setLogLevel('warn');
      expect(getLogLevel()).toBe('warn');

      setLogLevel('error');
      expect(getLogLevel()).toBe('error');
    });

    it('should throw error for invalid log level', () => {
      // @ts-expect-error Testing invalid input
      expect(() => setLogLevel('invalid')).toThrow('Invalid log level: invalid');
    });
  });
});
