import { AssetStore, type AssetMetadata, type AssetStoreOptions } from './index';
import { AssetMetrics } from './metrics';
import logger from '../logger';

export class MetricsAssetStore extends AssetStore {
  private metrics: AssetMetrics;

  constructor(options: AssetStoreOptions = {}) {
    super(options);
    this.metrics = AssetMetrics.getInstance();
  }

  async save(
    data: Buffer,
    type: 'image' | 'audio',
    mimeType: string,
    evalId: string,
    resultId: string,
    retries: number = 3,
  ): Promise<AssetMetadata> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const result = await super.save(data, type, mimeType, evalId, resultId);
        this.metrics.recordSave(true, result.size);
        return result;
      } catch (error) {
        lastError = error as Error;
        logger.warn(`Asset save attempt ${attempt}/${retries} failed:`, error);

        if (attempt < retries) {
          // Exponential backoff
          await new Promise((resolve) => setTimeout(resolve, 100 * Math.pow(2, attempt)));
        }
      }
    }

    this.metrics.recordSave(false, undefined, lastError!);
    throw lastError || new Error('Asset save failed');
  }

  async load(evalId: string, resultId: string, assetId: string): Promise<Buffer> {
    try {
      const result = await super.load(evalId, resultId, assetId);
      this.metrics.recordLoad(true);
      return result;
    } catch (error) {
      this.metrics.recordLoad(false, error as Error);
      throw error;
    }
  }
}

// Export a version with metrics by default
let metricsAssetStore: MetricsAssetStore | null = null;

export function getMetricsAssetStore(): MetricsAssetStore {
  if (!metricsAssetStore) {
    metricsAssetStore = new MetricsAssetStore();
  }
  return metricsAssetStore;
}