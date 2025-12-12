/**
 * Cost tracking for ElevenLabs API usage
 */

export interface CostBreakdown {
  capability: 'tts' | 'stt' | 'agent';
  operation: string;
  units: number;
  unitType: 'characters' | 'seconds' | 'minutes';
  estimatedCost: number;
  currency: 'USD';
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface CostSummary {
  totalCost: number;
  breakdown: CostBreakdown[];
  byCapability: Record<string, number>;
}

/**
 * Tracks cost for all ElevenLabs API operations
 */
export class CostTracker {
  private costs: CostBreakdown[] = [];

  /**
   * Pricing information (as of 2025-10-23)
   * These are estimates - actual costs may vary by subscription tier
   */
  static readonly PRICING = {
    tts: {
      charactersPerDollar: 50000, // ~$0.00002 per character (Free tier: 10k chars/month)
    },
    stt: {
      secondsPerDollar: 600, // ~$0.00167 per second (Free tier: 1 hour/month)
    },
    agent: {
      minutesPerDollar: 12.5, // ~$0.08 per minute (Free tier: 15 min/month)
      setupMultiplier: 1.0, // Setup/simulation doesn't have additional cost
    },
  };

  /**
   * Track TTS (Text-to-Speech) costs
   */
  trackTTS(characters: number, metadata?: Record<string, any>): number {
    // Don't charge for cached responses
    if (metadata?.cacheHit) {
      return 0;
    }

    const cost = characters / CostTracker.PRICING.tts.charactersPerDollar;

    this.costs.push({
      capability: 'tts',
      operation: 'text-to-speech',
      units: characters,
      unitType: 'characters',
      estimatedCost: cost,
      currency: 'USD',
      timestamp: new Date(),
      metadata,
    });

    return cost;
  }

  /**
   * Track STT (Speech-to-Text) costs
   */
  trackSTT(durationSeconds: number, metadata?: Record<string, any>): number {
    const cost = durationSeconds / CostTracker.PRICING.stt.secondsPerDollar;

    this.costs.push({
      capability: 'stt',
      operation: 'speech-to-text',
      units: durationSeconds,
      unitType: 'seconds',
      estimatedCost: cost,
      currency: 'USD',
      timestamp: new Date(),
      metadata,
    });

    return cost;
  }

  /**
   * Track Agent conversation costs
   */
  trackAgent(
    durationMinutes: number,
    isSetup: boolean = true,
    metadata?: Record<string, any>,
  ): number {
    let cost = durationMinutes / CostTracker.PRICING.agent.minutesPerDollar;

    // Apply setup multiplier if applicable
    if (isSetup) {
      cost *= CostTracker.PRICING.agent.setupMultiplier;
    }

    this.costs.push({
      capability: 'agent',
      operation: isSetup ? 'agent-simulation' : 'agent-conversation',
      units: durationMinutes,
      unitType: 'minutes',
      estimatedCost: cost,
      currency: 'USD',
      timestamp: new Date(),
      metadata: {
        ...metadata,
        isSetup,
      },
    });

    return cost;
  }

  /**
   * Get summary of all tracked costs
   */
  getSummary(): CostSummary {
    const byCapability: CostSummary['byCapability'] = {};

    for (const cost of this.costs) {
      if (!byCapability[cost.capability]) {
        byCapability[cost.capability] = 0;
      }
      byCapability[cost.capability]! += cost.estimatedCost;
    }

    return {
      totalCost: this.costs.reduce((sum, c) => sum + c.estimatedCost, 0),
      breakdown: this.costs,
      byCapability,
    };
  }

  /**
   * Reset all cost tracking
   */
  reset(): void {
    this.costs = [];
  }

  /**
   * Get detailed breakdown of all costs
   */
  getBreakdown(): CostBreakdown[] {
    return [...this.costs];
  }
}
