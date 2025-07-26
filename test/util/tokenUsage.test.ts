import { TokenUsageTracker } from '../../src/util/tokenUsage';

import type { TokenUsage } from '../../src/types/shared';

describe('TokenUsageTracker', () => {
  let tracker: TokenUsageTracker;

  beforeEach(() => {
    tracker = TokenUsageTracker.getInstance();
    tracker.resetAllUsage();
  });

  afterEach(() => {
    tracker.cleanup();
  });

  it('should track token usage for a provider', () => {
    const usage: TokenUsage = {
      total: 100,
      prompt: 50,
      completion: 50,
      cached: 10,
      numRequests: 1,
      completionDetails: {
        reasoning: 20,
        acceptedPrediction: 15,
        rejectedPrediction: 5,
      },
      assertions: {
        total: 30,
        prompt: 10,
        completion: 15,
        cached: 5,
      },
    };

    tracker.trackUsage('test-provider', usage);
    const tracked = tracker.getProviderUsage('test-provider');

    expect(tracked).toEqual({
      ...usage,
      assertions: {
        ...usage.assertions,
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      },
    });
  });

  it('should handle undefined token usage', () => {
    tracker.trackUsage('test-provider', undefined);
    expect(tracker.getProviderUsage('test-provider')).toBeUndefined();
  });

  it('should merge token usage for the same provider', () => {
    const usage1: TokenUsage = {
      total: 100,
      prompt: 50,
      completion: 50,
      cached: 10,
      numRequests: 1,
      completionDetails: {
        reasoning: 20,
        acceptedPrediction: 15,
        rejectedPrediction: 5,
      },
      assertions: {
        total: 30,
        prompt: 10,
        completion: 15,
        cached: 5,
      },
    };

    const usage2: TokenUsage = {
      total: 200,
      prompt: 100,
      completion: 100,
      cached: 20,
      numRequests: 2,
      completionDetails: {
        reasoning: 40,
        acceptedPrediction: 30,
        rejectedPrediction: 10,
      },
      assertions: {
        total: 60,
        prompt: 20,
        completion: 30,
        cached: 10,
      },
    };

    tracker.trackUsage('test-provider', usage1);
    tracker.trackUsage('test-provider', usage2);

    const merged = tracker.getProviderUsage('test-provider');
    expect(merged).toEqual({
      total: 300,
      prompt: 150,
      completion: 150,
      cached: 30,
      numRequests: 3,
      completionDetails: {
        reasoning: 60,
        acceptedPrediction: 45,
        rejectedPrediction: 15,
      },
      assertions: {
        total: 90,
        prompt: 30,
        completion: 45,
        cached: 15,
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      },
    });
  });

  it('should get provider IDs', () => {
    tracker.trackUsage('provider1', { total: 100 });
    tracker.trackUsage('provider2', { total: 200 });

    expect(tracker.getProviderIds()).toEqual(['provider1', 'provider2']);
  });

  it('should get total usage across all providers', () => {
    tracker.trackUsage('provider1', {
      total: 100,
      prompt: 50,
      completion: 50,
      cached: 10,
      numRequests: 1,
      completionDetails: {
        reasoning: 20,
        acceptedPrediction: 15,
        rejectedPrediction: 5,
      },
      assertions: {
        total: 30,
        prompt: 10,
        completion: 15,
        cached: 5,
      },
    });

    tracker.trackUsage('provider2', {
      total: 200,
      prompt: 100,
      completion: 100,
      cached: 20,
      numRequests: 2,
      completionDetails: {
        reasoning: 40,
        acceptedPrediction: 30,
        rejectedPrediction: 10,
      },
      assertions: {
        total: 60,
        prompt: 20,
        completion: 30,
        cached: 10,
      },
    });

    expect(tracker.getTotalUsage()).toEqual({
      total: 300,
      prompt: 150,
      completion: 150,
      cached: 30,
      numRequests: 3,
      completionDetails: {
        reasoning: 60,
        acceptedPrediction: 45,
        rejectedPrediction: 15,
      },
      assertions: {
        total: 90,
        prompt: 30,
        completion: 45,
        cached: 15,
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      },
    });
  });

  it('should reset provider usage', () => {
    tracker.trackUsage('provider1', { total: 100 });
    tracker.resetProviderUsage('provider1');
    expect(tracker.getProviderUsage('provider1')).toBeUndefined();
  });

  it('should reset all usage', () => {
    tracker.trackUsage('provider1', { total: 100 });
    tracker.trackUsage('provider2', { total: 200 });
    tracker.resetAllUsage();
    expect(tracker.getProviderIds()).toHaveLength(0);
  });
});
