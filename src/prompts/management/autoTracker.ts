import crypto from 'crypto';
import logger from '../../logger';
import { cloudConfig } from '../../globalConfig/cloud';
import type { Prompt } from '../../types';
import type { AutoTrackingConfig } from '../../types/prompt-management';
import { PromptManager } from './PromptManager';
import { analyzePrompt } from './promptAnalyzer';

// Default configuration for auto-tracking
const DEFAULT_CONFIG: AutoTrackingConfig = {
  enabled: process.env.PROMPTFOO_AUTO_TRACK_PROMPTS === 'true',
  excludePatterns: [
    'pf://*', // Already managed prompts
    'file://*.test.*', // Test files
    'file://*test*', // Test-related files
  ],
  includeMetadata: true,
};

class PromptAutoTracker {
  private config: AutoTrackingConfig;
  private manager: PromptManager;
  private trackedPrompts: Set<string> = new Set();

  constructor(config?: Partial<AutoTrackingConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.manager = new PromptManager();
  }

  /**
   * Track a prompt if it's not already managed
   */
  async trackPrompt(prompt: Prompt): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // Skip if already a managed prompt
    if (typeof prompt.raw === 'string' && prompt.raw.startsWith('pf://')) {
      return;
    }

    // Check exclude patterns
    const promptStr = typeof prompt.raw === 'string' ? prompt.raw : JSON.stringify(prompt.raw);
    if (this.shouldExclude(promptStr)) {
      return;
    }

    // Generate a unique ID for this prompt
    const promptId = this.generatePromptId(prompt);

    // Skip if we've already tracked this prompt in this session
    if (this.trackedPrompts.has(promptId)) {
      return;
    }

    try {
      // Check if prompt already exists
      const existingPrompt = await this.manager.getPrompt(promptId);
      if (existingPrompt) {
        this.trackedPrompts.add(promptId);
        return;
      }

      // Analyze the prompt to extract features
      const analysis = analyzePrompt(prompt);

      // Create the managed prompt
      const content =
        typeof prompt.raw === 'object' ? JSON.stringify(prompt.raw, null, 2) : prompt.raw;

      await this.manager.createPrompt(promptId, prompt.label || 'Auto-tracked prompt', content);

      // Update the prompt with additional metadata
      if (analysis.config || analysis.contentType !== 'string') {
        await this.updatePromptMetadata(promptId, analysis);
      }

      this.trackedPrompts.add(promptId);
      logger.info(`Auto-tracked prompt: ${promptId}`);
    } catch (error) {
      logger.debug(`Failed to auto-track prompt: ${error}`);
    }
  }

  /**
   * Track multiple prompts
   */
  async trackPrompts(prompts: Prompt[]): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // Process in parallel but limit concurrency
    const batchSize = 5;
    for (let i = 0; i < prompts.length; i += batchSize) {
      const batch = prompts.slice(i, i + batchSize);
      await Promise.all(batch.map((p) => this.trackPrompt(p)));
    }
  }

  /**
   * Generate a unique ID for a prompt based on its content
   */
  private generatePromptId(prompt: Prompt): string {
    const content = typeof prompt.raw === 'object' ? JSON.stringify(prompt.raw) : prompt.raw;

    // Create a hash of the content
    const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 8);

    // Use label if available, otherwise use hash
    const baseId = prompt.label
      ? prompt.label.toLowerCase().replace(/[^a-z0-9-_]/g, '-')
      : `prompt-${hash}`;

    return baseId;
  }

  /**
   * Check if a prompt should be excluded from tracking
   */
  private shouldExclude(promptStr: string): boolean {
    if (!this.config.excludePatterns) {
      return false;
    }

    return this.config.excludePatterns.some((pattern) => {
      // Simple glob pattern matching
      const regex = pattern.replace(/\*/g, '.*').replace(/\?/g, '.');
      return new RegExp(`^${regex}$`).test(promptStr);
    });
  }

  /**
   * Update prompt metadata in the database
   */
  private async updatePromptMetadata(promptId: string, analysis: any): Promise<void> {
    // This would require extending the PromptManager API to support
    // updating specific version fields. For now, we'll skip this.
    // In a full implementation, we'd update the database directly.
    logger.debug(`Would update metadata for ${promptId}: ${JSON.stringify(analysis)}`);
  }
}

// Singleton instance
let autoTracker: PromptAutoTracker | null = null;

/**
 * Get or create the auto-tracker instance
 */
export function getAutoTracker(config?: Partial<AutoTrackingConfig>): PromptAutoTracker {
  if (!autoTracker) {
    autoTracker = new PromptAutoTracker(config);
  }
  return autoTracker;
}

/**
 * Enable or disable auto-tracking
 */
export function setAutoTrackingEnabled(enabled: boolean): void {
  const tracker = getAutoTracker();
  tracker['config'].enabled = enabled;
}

/**
 * Track a single prompt
 */
export async function autoTrackPrompt(prompt: Prompt): Promise<void> {
  const tracker = getAutoTracker();
  await tracker.trackPrompt(prompt);
}

/**
 * Track multiple prompts
 */
export async function autoTrackPrompts(prompts: Prompt[]): Promise<void> {
  const tracker = getAutoTracker();
  await tracker.trackPrompts(prompts);
}
