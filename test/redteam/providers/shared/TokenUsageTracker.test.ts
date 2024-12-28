import { TokenUsageTracker } from '../../../../src/redteam/providers/shared/TokenUsageTracker';

describe('TokenUsageTracker', () => {
  let tracker: TokenUsageTracker;

  beforeEach(() => {
    tracker = new TokenUsageTracker();
  });

  it('should initialize with zero values', () => {
    const usage = tracker.getUsage();
    expect(usage).toEqual({
      total: 0,
      prompt: 0,
      completion: 0,
      numRequests: 0,
      cached: 0,
    });
  });

  it('should update usage with new values', () => {
    tracker.update({
      total: 100,
      prompt: 50,
      completion: 50,
      numRequests: 1,
      cached: 0,
    });

    const usage = tracker.getUsage();
    expect(usage).toEqual({
      total: 100,
      prompt: 50,
      completion: 50,
      numRequests: 1,
      cached: 0,
    });
  });

  it('should handle undefined values', () => {
    tracker.update({
      total: undefined,
      prompt: 50,
      completion: undefined,
      numRequests: undefined,
      cached: 0,
    });

    const usage = tracker.getUsage();
    expect(usage).toEqual({
      total: 0,
      prompt: 50,
      completion: 0,
      numRequests: 1,
      cached: 0,
    });
  });

  it('should accumulate multiple updates', () => {
    tracker.update({
      total: 100,
      prompt: 50,
      completion: 50,
      numRequests: 1,
      cached: 0,
    });

    tracker.update({
      total: 200,
      prompt: 100,
      completion: 100,
      numRequests: 2,
      cached: 1,
    });

    const usage = tracker.getUsage();
    expect(usage).toEqual({
      total: 300,
      prompt: 150,
      completion: 150,
      numRequests: 3,
      cached: 1,
    });
  });

  it('should increment numRequests when no usage provided', () => {
    tracker.update();
    expect(tracker.getUsage().numRequests).toBe(1);
  });
});
