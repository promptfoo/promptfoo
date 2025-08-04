import * as fs from 'fs/promises';
import { getDb } from '../util/database';
import { getAssetStore } from '../assets';
import { isAssetStorageEnabled } from '../assets';
import logger from '../logger';

export interface MigrationOptions {
  dryRun?: boolean;
  batchSize?: number;
  evalIds?: string[];
  afterDate?: Date;
  beforeDate?: Date;
  onProgress?: (processed: number, total: number) => void;
}

export interface MigrationResult {
  totalResults: number;
  processedResults: number;
  migratedAssets: number;
  failedMigrations: number;
  bytesFreed: number;
  errors: string[];
}

interface EvalResult {
  id: string;
  evalId: string;
  response: any;
  createdAt: string;
}

export class AssetMigrator {
  private assetStore = getAssetStore();
  
  async migrate(options: MigrationOptions = {}): Promise<MigrationResult> {
    if (!isAssetStorageEnabled()) {
      throw new Error('Asset storage must be enabled to run migration');
    }

    const {
      dryRun = false,
      batchSize = 100,
      evalIds,
      afterDate,
      beforeDate,
      onProgress,
    } = options;

    const result: MigrationResult = {
      totalResults: 0,
      processedResults: 0,
      migratedAssets: 0,
      failedMigrations: 0,
      bytesFreed: 0,
      errors: [],
    };

    try {
      const db = getDb();
      
      // Build query
      let query = db.select()
        .from('eval_results')
        .where('response IS NOT NULL');

      if (evalIds && evalIds.length > 0) {
        query = query.where('evalId IN (?)', evalIds);
      }

      if (afterDate) {
        query = query.where('createdAt > ?', afterDate.toISOString());
      }

      if (beforeDate) {
        query = query.where('createdAt < ?', beforeDate.toISOString());
      }

      // Get total count
      const countResult = await db.get(
        `SELECT COUNT(*) as count FROM eval_results WHERE response IS NOT NULL ${this.buildWhereClause(evalIds, afterDate, beforeDate)}`,
        ...this.buildWhereParams(evalIds, afterDate, beforeDate)
      );
      result.totalResults = countResult?.count || 0;

      if (result.totalResults === 0) {
        logger.info('No results to migrate');
        return result;
      }

      logger.info(`Found ${result.totalResults} results to process`);

      // Process in batches
      let offset = 0;
      while (offset < result.totalResults) {
        const batch = await db.all<EvalResult[]>(
          `SELECT id, evalId, response, createdAt FROM eval_results 
           WHERE response IS NOT NULL ${this.buildWhereClause(evalIds, afterDate, beforeDate)}
           ORDER BY createdAt DESC
           LIMIT ? OFFSET ?`,
          ...this.buildWhereParams(evalIds, afterDate, beforeDate),
          batchSize,
          offset
        );

        for (const row of batch) {
          try {
            const migrated = await this.migrateResult(row, dryRun);
            if (migrated) {
              result.migratedAssets += migrated.count;
              result.bytesFreed += migrated.bytesFreed;
            }
            result.processedResults++;
          } catch (error) {
            result.failedMigrations++;
            result.errors.push(`Failed to migrate result ${row.id}: ${error}`);
            logger.error(`Failed to migrate result ${row.id}:`, error);
          }

          if (onProgress) {
            onProgress(result.processedResults, result.totalResults);
          }
        }

        offset += batchSize;

        // Add a small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      logger.info(`Migration complete: ${result.migratedAssets} assets migrated, ${this.formatBytes(result.bytesFreed)} freed`);
    } catch (error) {
      logger.error('Migration failed:', error);
      throw error;
    }

    return result;
  }

  private async migrateResult(
    result: EvalResult, 
    dryRun: boolean
  ): Promise<{ count: number; bytesFreed: number } | null> {
    const response = result.response;
    if (!response || typeof response !== 'object') {
      return null;
    }

    let migratedCount = 0;
    let bytesFreed = 0;
    let modified = false;

    // Clone response to avoid modifying original in dry run
    const newResponse = dryRun ? JSON.parse(JSON.stringify(response)) : response;

    // Check for base64 images
    if (typeof newResponse.output === 'string') {
      const imageMatch = newResponse.output.match(/^data:(image\/[a-z]+);base64,(.+)$/);
      if (imageMatch) {
        const [, mimeType, base64Data] = imageMatch;
        const buffer = Buffer.from(base64Data, 'base64');
        
        if (!dryRun) {
          const metadata = await this.assetStore.save(
            buffer,
            'image',
            mimeType,
            result.evalId,
            result.id
          );
          
          // Replace base64 with asset reference
          newResponse.output = `![Migrated image](promptfoo://${result.evalId}/${result.id}/${metadata.id})`;
          modified = true;
        }
        
        migratedCount++;
        bytesFreed += base64Data.length;
      }
    }

    // Check for audio data
    if (newResponse.audio?.data && typeof newResponse.audio.data === 'string') {
      const buffer = Buffer.from(newResponse.audio.data, 'base64');
      const format = newResponse.audio.format || 'wav';
      
      if (!dryRun) {
        const metadata = await this.assetStore.save(
          buffer,
          'audio',
          `audio/${format}`,
          result.evalId,
          result.id
        );
        
        // Replace base64 with asset reference
        newResponse.output = `[Audio](promptfoo://${result.evalId}/${result.id}/${metadata.id})`;
        delete newResponse.audio;
        modified = true;
      }
      
      migratedCount++;
      bytesFreed += newResponse.audio.data.length;
    }

    // Update database if not dry run and something was modified
    if (!dryRun && modified) {
      const db = getDb();
      await db.run(
        'UPDATE eval_results SET response = ? WHERE id = ?',
        JSON.stringify(newResponse),
        result.id
      );
    }

    return migratedCount > 0 ? { count: migratedCount, bytesFreed } : null;
  }

  private buildWhereClause(evalIds?: string[], afterDate?: Date, beforeDate?: Date): string {
    const clauses: string[] = [];
    
    if (evalIds && evalIds.length > 0) {
      clauses.push(`evalId IN (${evalIds.map(() => '?').join(',')})`);
    }
    
    if (afterDate) {
      clauses.push('createdAt > ?');
    }
    
    if (beforeDate) {
      clauses.push('createdAt < ?');
    }
    
    return clauses.length > 0 ? ' AND ' + clauses.join(' AND ') : '';
  }

  private buildWhereParams(evalIds?: string[], afterDate?: Date, beforeDate?: Date): any[] {
    const params: any[] = [];
    
    if (evalIds && evalIds.length > 0) {
      params.push(...evalIds);
    }
    
    if (afterDate) {
      params.push(afterDate.toISOString());
    }
    
    if (beforeDate) {
      params.push(beforeDate.toISOString());
    }
    
    return params;
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  async estimateSavings(options: Omit<MigrationOptions, 'dryRun' | 'onProgress'> = {}): Promise<{
    totalResults: number;
    estimatedAssets: number;
    estimatedSavings: number;
  }> {
    const db = getDb();
    const { evalIds, afterDate, beforeDate } = options;

    // Get sample of results
    const sampleSize = 100;
    const results = await db.all<EvalResult[]>(
      `SELECT id, evalId, response FROM eval_results 
       WHERE response IS NOT NULL ${this.buildWhereClause(evalIds, afterDate, beforeDate)}
       ORDER BY RANDOM()
       LIMIT ?`,
      ...this.buildWhereParams(evalIds, afterDate, beforeDate),
      sampleSize
    );

    let totalBase64Size = 0;
    let assetCount = 0;

    for (const result of results) {
      const response = result.response;
      if (!response || typeof response !== 'object') continue;

      // Check for base64 images
      if (typeof response.output === 'string') {
        const imageMatch = response.output.match(/^data:(image\/[a-z]+);base64,(.+)$/);
        if (imageMatch) {
          totalBase64Size += imageMatch[2].length;
          assetCount++;
        }
      }

      // Check for audio data
      if (response.audio?.data && typeof response.audio.data === 'string') {
        totalBase64Size += response.audio.data.length;
        assetCount++;
      }
    }

    // Extrapolate from sample
    const countResult = await db.get(
      `SELECT COUNT(*) as count FROM eval_results WHERE response IS NOT NULL ${this.buildWhereClause(evalIds, afterDate, beforeDate)}`,
      ...this.buildWhereParams(evalIds, afterDate, beforeDate)
    );
    const totalResults = countResult?.count || 0;

    const scaleFactor = totalResults / Math.max(1, results.length);
    const estimatedAssets = Math.round(assetCount * scaleFactor);
    const estimatedSavings = Math.round(totalBase64Size * scaleFactor);

    return {
      totalResults,
      estimatedAssets,
      estimatedSavings,
    };
  }
}