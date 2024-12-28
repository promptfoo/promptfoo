import { type TokenUsage } from '../../../types';

export class TokenUsageTracker {
  private usage: Required<TokenUsage>;

  constructor() {
    this.usage = {
      total: 0,
      prompt: 0,
      completion: 0,
      numRequests: 0,
      cached: 0,
    };
  }

  update(newUsage?: TokenUsage): void {
    if (newUsage) {
      this.usage.total += newUsage.total ?? 0;
      this.usage.prompt += newUsage.prompt ?? 0;
      this.usage.completion += newUsage.completion ?? 0;
      this.usage.numRequests += newUsage.numRequests ?? 1;
      this.usage.cached += newUsage.cached ?? 0;
    } else {
      this.usage.numRequests += 1;
    }
  }

  getUsage(): TokenUsage {
    return { ...this.usage };
  }
}
