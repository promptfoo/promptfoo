import logger from '../../logger';
import { RedteamPluginBase } from './base';

import type { Assertion, PluginConfig, TestCase } from '../../types/index';

/**
 * Configuration for image dataset plugins
 */
export interface ImageDatasetPluginConfig extends PluginConfig {
  categories?: string[];
  subcategories?: string[];
}

/**
 * Base class for image dataset plugins (VLGuard, UnsafeBench, etc.)
 */
export abstract class ImageDatasetPluginBase<
  TInput extends { image: string },
  TConfig extends ImageDatasetPluginConfig = ImageDatasetPluginConfig,
> extends RedteamPluginBase {
  protected abstract readonly datasetManager: {
    getFilteredRecords(limit: number, config?: TConfig): Promise<TInput[]>;
  };
  protected pluginConfig?: TConfig;

  constructor(provider: any, purpose: string, injectVar: string, config?: TConfig) {
    super(provider, purpose, injectVar, config);
    this.pluginConfig = config;
    this.validateConfig(config);
  }

  /**
   * Validate plugin configuration
   * Override in subclasses to add specific validation
   */
  protected abstract validateConfig(config?: TConfig): void;

  /**
   * Get the template for the plugin
   */
  async getTemplate(): Promise<string> {
    return this.injectVar;
  }

  /**
   * Get assertions for a test case
   */
  protected getAssertions(_prompt: string): Assertion[] {
    return [
      {
        type: this.id as Assertion['type'],
        metric: this.metricName,
      },
    ];
  }

  /**
   * Display name for assertion metrics; its lowercase form prefixes logs.
   */
  protected abstract readonly metricName: string;

  /**
   * Map a record to test case metadata
   */
  protected abstract mapRecordToMetadata(record: TInput): Record<string, any>;

  /**
   * Extract assertion value from a record
   */
  protected abstract extractAssertionValue(record: TInput): any;

  /**
   * Generate test cases
   */
  async generateTests(n: number, _delayMs: number = 0): Promise<TestCase[]> {
    const logPrefix = this.metricName.toLowerCase();
    try {
      // Determine how many images to fetch
      const categories = this.pluginConfig?.categories || [];
      let limit = n;
      if (categories.length > 0) {
        // If categories are specified, we want n images per category
        limit = n * categories.length;
      }

      // Fetch and filter records
      const records = await this.datasetManager.getFilteredRecords(limit, this.pluginConfig);

      if (records.length === 0) {
        const errorMessage = this.getNoRecordsErrorMessage();
        logger.error(`[${logPrefix}] ${errorMessage}`);
        throw new Error(errorMessage);
      }

      if (records.length < limit) {
        logger.warn(
          `[${logPrefix}] Requested ${limit} tests but only ${records.length} records were found`,
        );
      }

      // Map records to test cases
      return records.map(
        (record: TInput): TestCase => ({
          vars: { [this.injectVar]: record.image },
          assert: [
            {
              type: this.id as Assertion['type'],
              metric: this.metricName,
              value: this.extractAssertionValue(record),
            },
          ],
          metadata: this.mapRecordToMetadata(record),
        }),
      );
    } catch (error) {
      const errorMessage = `Failed to generate tests: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(`[${logPrefix}] ${errorMessage}`);
      throw new Error(errorMessage);
    }
  }

  /**
   * Get the error message when no records are found
   */
  protected getNoRecordsErrorMessage(): string {
    return (
      'No records found. This may be due to: ' +
      '1) Missing or invalid HF_TOKEN environment variable, ' +
      '2) Network connectivity issues, ' +
      '3) Invalid category/subcategory filters in config'
    );
  }
}
