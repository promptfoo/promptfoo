import { formatDuration } from '../../src/util/formatDuration';

describe('eval command', () => {
  describe('formatDuration', () => {
    it('should format duration based on elapsed time', () => {
      // Test format for seconds
      expect(formatDuration(45)).toBe('45s');
      
      // Test format for minutes and seconds
      expect(formatDuration(65)).toBe('1m 5s');
      
      // Test format for hours, minutes, and seconds
      expect(formatDuration(3661)).toBe('1h 1m 1s');
    });
  });
}); 