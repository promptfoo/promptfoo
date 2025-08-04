import * as fs from 'fs/promises';
import * as path from 'path';
import { getEnvInt } from '../envars';
import logger from '../logger';
import { getConfigDirectoryPath } from '../util/config/manage';
import { AssetStore } from './index';

export interface CleanupOptions {
  dryRun?: boolean;
  maxAgeDays?: number;
  orphanedOnly?: boolean;
}

export interface CleanupResult {
  scannedFiles: number;
  deletedFiles: number;
  freedBytes: number;
  errors: string[];
}

export class AssetCleanup {
  private assetStore: AssetStore;

  constructor(assetStore: AssetStore) {
    this.assetStore = assetStore;
  }

  /**
   * Clean up old or orphaned assets
   */
  async cleanup(options: CleanupOptions = {}): Promise<CleanupResult> {
    const {
      dryRun = false,
      maxAgeDays = getEnvInt('PROMPTFOO_ASSET_MAX_AGE_DAYS', 30),
      orphanedOnly = false,
    } = options;

    const result: CleanupResult = {
      scannedFiles: 0,
      deletedFiles: 0,
      freedBytes: 0,
      errors: [],
    };

    const assetsPath = path.join(getConfigDirectoryPath(), 'assets');

    try {
      await this.scanDirectory(assetsPath, maxAgeDays, orphanedOnly, dryRun, result);
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.info('No assets directory found, nothing to clean up');
        return result;
      }
      throw error;
    }

    if (dryRun) {
      logger.info(
        `[DRY RUN] Would delete ${result.deletedFiles} files, freeing ${this.formatBytes(result.freedBytes)}`,
      );
    } else {
      logger.info(
        `Cleaned up ${result.deletedFiles} files, freed ${this.formatBytes(result.freedBytes)}`,
      );
    }

    return result;
  }

  private async scanDirectory(
    dir: string,
    maxAgeDays: number,
    orphanedOnly: boolean,
    dryRun: boolean,
    result: CleanupResult,
  ): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await this.scanDirectory(fullPath, maxAgeDays, orphanedOnly, dryRun, result);
      } else if (entry.isFile()) {
        await this.processFile(fullPath, maxAgeDays, orphanedOnly, dryRun, result);
      }
    }

    // Remove empty directories (except the root assets directory)
    if (dir !== path.join(getConfigDirectoryPath(), 'assets')) {
      const remainingEntries = await fs.readdir(dir);
      if (remainingEntries.length === 0) {
        if (!dryRun) {
          await fs.rmdir(dir);
        }
        logger.debug(`${dryRun ? '[DRY RUN] Would remove' : 'Removed'} empty directory: ${dir}`);
      }
    }
  }

  private async processFile(
    filePath: string,
    maxAgeDays: number,
    orphanedOnly: boolean,
    dryRun: boolean,
    result: CleanupResult,
  ): Promise<void> {
    result.scannedFiles++;

    try {
      const stats = await fs.stat(filePath);
      const ageInDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);

      let shouldDelete = false;
      let reason = '';

      // Check if it's a metadata file
      if (filePath.endsWith('.meta.json')) {
        // Check if the corresponding asset file exists
        const assetPath = filePath.replace('.meta.json', '');
        try {
          await fs.access(assetPath);
        } catch {
          shouldDelete = true;
          reason = 'orphaned metadata file';
        }
      } else {
        // It's an asset file, check if metadata exists
        const metadataPath = `${filePath}.meta.json`;
        try {
          await fs.access(metadataPath);

          // Metadata exists, check age if not orphaned-only mode
          if (!orphanedOnly && ageInDays > maxAgeDays) {
            shouldDelete = true;
            reason = `older than ${maxAgeDays} days`;
          }
        } catch {
          // No metadata, it's orphaned
          shouldDelete = true;
          reason = 'orphaned asset file';
        }
      }

      if (shouldDelete) {
        if (!dryRun) {
          await fs.unlink(filePath);
          // Also remove metadata if this is an asset file
          if (!filePath.endsWith('.meta.json')) {
            const metadataPath = `${filePath}.meta.json`;
            try {
              await fs.unlink(metadataPath);
            } catch {
              // Metadata might not exist
            }
          }
        }

        result.deletedFiles++;
        result.freedBytes += stats.size;

        logger.debug(
          `${dryRun ? '[DRY RUN] Would delete' : 'Deleted'} ${filePath} (${reason}, ${this.formatBytes(stats.size)})`,
        );
      }
    } catch (error) {
      const errorMsg = `Error processing ${filePath}: ${error}`;
      logger.error(errorMsg);
      result.errors.push(errorMsg);
    }
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

  /**
   * Get statistics about asset storage
   */
  async getStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    oldestFile: Date | null;
    newestFile: Date | null;
    sizeByType: Record<string, number>;
  }> {
    const stats = {
      totalFiles: 0,
      totalSize: 0,
      oldestFile: null as Date | null,
      newestFile: null as Date | null,
      sizeByType: {} as Record<string, number>,
    };

    const assetsPath = path.join(getConfigDirectoryPath(), 'assets');

    try {
      await this.collectStats(assetsPath, stats);
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT')) {
        throw error;
      }
    }

    return stats;
  }

  private async collectStats(
    dir: string,
    stats: {
      totalFiles: number;
      totalSize: number;
      oldestFile: Date | null;
      newestFile: Date | null;
      sizeByType: Record<string, number>;
    },
  ): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await this.collectStats(fullPath, stats);
      } else if (entry.isFile() && !entry.name.endsWith('.meta.json')) {
        const fileStat = await fs.stat(fullPath);
        stats.totalFiles++;
        stats.totalSize += fileStat.size;

        // Update oldest/newest
        if (!stats.oldestFile || fileStat.mtime < stats.oldestFile) {
          stats.oldestFile = fileStat.mtime;
        }
        if (!stats.newestFile || fileStat.mtime > stats.newestFile) {
          stats.newestFile = fileStat.mtime;
        }

        // Get type from metadata if available
        try {
          const metadataPath = `${fullPath}.meta.json`;
          const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
          const type = metadata.type || 'unknown';
          stats.sizeByType[type] = (stats.sizeByType[type] || 0) + fileStat.size;
        } catch {
          stats.sizeByType.unknown = (stats.sizeByType.unknown || 0) + fileStat.size;
        }
      }
    }
  }
}
