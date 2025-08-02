import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

import { getEnvInt } from '../envars';
import logger from '../logger';
import { getConfigDirectoryPath } from '../util/config/manage';

const execAsync = promisify(exec);

export interface DiskUsageInfo {
  total: number;
  used: number;
  available: number;
  percentUsed: number;
}

export class AssetMonitor {
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly warningThreshold: number;
  private readonly criticalThreshold: number;

  constructor() {
    this.warningThreshold = getEnvInt('PROMPTFOO_ASSET_DISK_WARNING_THRESHOLD', 20);
    this.criticalThreshold = getEnvInt('PROMPTFOO_ASSET_DISK_CRITICAL_THRESHOLD', 10);
  }

  start(): void {
    // Check disk space every 5 minutes
    this.checkInterval = setInterval(
      () => {
        this.checkDiskSpace().catch((error) => {
          logger.error('Failed to check disk space:', error);
        });
      },
      5 * 60 * 1000,
    );

    // Initial check
    this.checkDiskSpace().catch((error) => {
      logger.error('Failed to check disk space:', error);
    });
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  async getDiskUsage(directory: string): Promise<DiskUsageInfo> {
    try {
      // Use df command on Unix-like systems
      const { stdout } = await execAsync(`df -k "${directory}"`);
      const lines = stdout.trim().split('\n');

      if (lines.length < 2) {
        throw new Error('Unexpected df output');
      }

      // Parse the second line which contains the data
      const parts = lines[1].split(/\s+/).filter(Boolean);

      // df -k gives sizes in 1K blocks
      const total = parseInt(parts[1], 10) * 1024;
      const used = parseInt(parts[2], 10) * 1024;
      const available = parseInt(parts[3], 10) * 1024;
      const percentUsed = parseInt(parts[4], 10);

      return {
        total,
        used,
        available,
        percentUsed,
      };
    } catch (error) {
      // Fallback method using fs.statfs (Node.js 18.15+)
      try {
        const stats = await fs.statfs(directory);
        const total = stats.blocks * stats.bsize;
        const available = stats.bavail * stats.bsize;
        const used = total - available;
        const percentUsed = Math.round((used / total) * 100);

        return {
          total,
          used,
          available,
          percentUsed,
        };
      } catch (statfsError) {
        logger.error('Failed to get disk usage with both df and statfs:', statfsError);
        throw error;
      }
    }
  }

  async checkDiskSpace(): Promise<void> {
    try {
      const assetsPath = path.join(getConfigDirectoryPath(), 'assets');

      // Create directory if it doesn't exist
      await fs.mkdir(assetsPath, { recursive: true });

      const diskInfo = await this.getDiskUsage(assetsPath);
      const freePercentage = 100 - diskInfo.percentUsed;

      if (freePercentage < this.criticalThreshold) {
        logger.error(
          `CRITICAL: Disk space low! Only ${freePercentage.toFixed(1)}% free (${this.formatBytes(
            diskInfo.available,
          )} available)`,
        );
        // In a production system, this would trigger alerts
      } else if (freePercentage < this.warningThreshold) {
        logger.warn(
          `WARNING: Disk space getting low: ${freePercentage.toFixed(1)}% free (${this.formatBytes(
            diskInfo.available,
          )} available)`,
        );
      }

      // Log metrics for debugging
      logger.debug('Disk usage:', {
        total: this.formatBytes(diskInfo.total),
        used: this.formatBytes(diskInfo.used),
        available: this.formatBytes(diskInfo.available),
        percentUsed: `${diskInfo.percentUsed}%`,
        freePercentage: `${freePercentage.toFixed(1)}%`,
      });
    } catch (error) {
      logger.error('Failed to check disk space:', error);
    }
  }

  async getAssetStorageSize(): Promise<number> {
    const assetsPath = path.join(getConfigDirectoryPath(), 'assets');

    try {
      const size = await this.getDirectorySize(assetsPath);
      return size;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return 0; // Directory doesn't exist yet
      }
      throw error;
    }
  }

  private async getDirectorySize(dir: string): Promise<number> {
    let size = 0;

    const files = await fs.readdir(dir, { withFileTypes: true });

    for (const file of files) {
      const filePath = path.join(dir, file.name);

      if (file.isDirectory()) {
        size += await this.getDirectorySize(filePath);
      } else {
        const stats = await fs.stat(filePath);
        size += stats.size;
      }
    }

    return size;
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}

// Singleton instance
let monitorInstance: AssetMonitor | null = null;

export function getAssetMonitor(): AssetMonitor {
  if (!monitorInstance) {
    monitorInstance = new AssetMonitor();
  }
  return monitorInstance;
}
