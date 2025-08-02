import logger from '../logger';

export interface AssetMetricsData {
  saveAttempts: number;
  saveSuccesses: number;
  saveFailures: number;
  loadAttempts: number;
  loadSuccesses: number;
  loadFailures: number;
  totalBytesStored: number;
  largestAsset: number;
  saveSuccessRate: number;
  loadSuccessRate: number;
  averageAssetSize: number;
}

export class AssetMetrics {
  private static instance: AssetMetrics;
  private metrics = {
    saveAttempts: 0,
    saveSuccesses: 0,
    saveFailures: 0,
    loadAttempts: 0,
    loadSuccesses: 0,
    loadFailures: 0,
    totalBytesStored: 0,
    largestAsset: 0,
  };

  private constructor() {}

  static getInstance(): AssetMetrics {
    if (!this.instance) {
      this.instance = new AssetMetrics();
    }
    return this.instance;
  }

  recordSave(success: boolean, size?: number, error?: Error): void {
    this.metrics.saveAttempts++;
    if (success && size !== undefined) {
      this.metrics.saveSuccesses++;
      this.metrics.totalBytesStored += size;
      this.metrics.largestAsset = Math.max(this.metrics.largestAsset, size);
    } else {
      this.metrics.saveFailures++;
      if (error) {
        logger.debug('Asset save failed:', error.message);
      }
    }
  }

  recordLoad(success: boolean, error?: Error): void {
    this.metrics.loadAttempts++;
    if (success) {
      this.metrics.loadSuccesses++;
    } else {
      this.metrics.loadFailures++;
      if (error) {
        logger.debug('Asset load failed:', error.message);
      }
    }
  }

  getMetrics(): AssetMetricsData {
    return {
      ...this.metrics,
      saveSuccessRate:
        this.metrics.saveAttempts > 0 ? this.metrics.saveSuccesses / this.metrics.saveAttempts : 0,
      loadSuccessRate:
        this.metrics.loadAttempts > 0 ? this.metrics.loadSuccesses / this.metrics.loadAttempts : 0,
      averageAssetSize:
        this.metrics.saveSuccesses > 0
          ? this.metrics.totalBytesStored / this.metrics.saveSuccesses
          : 0,
    };
  }

  reset(): void {
    this.metrics = {
      saveAttempts: 0,
      saveSuccesses: 0,
      saveFailures: 0,
      loadAttempts: 0,
      loadSuccesses: 0,
      loadFailures: 0,
      totalBytesStored: 0,
      largestAsset: 0,
    };
  }
}
