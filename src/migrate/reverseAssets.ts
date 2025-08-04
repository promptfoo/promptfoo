/**
 * Reverse migration tool - converts asset URLs back to base64 inline data
 * This is useful when you want to disable asset storage or export data to systems that don't support it
 */

import { eq } from 'drizzle-orm';
import { getDb } from '../database';
import { evalsTable, evalResultsTable } from '../database/tables';
import { getAssetStore, isAssetStorageEnabled } from '../assets';
import logger from '../logger';
import { detectMimeType } from '../util/mimeTypes';

export interface ReverseMigrationOptions {
  evalId?: string;
  dryRun?: boolean;
  force?: boolean;
}

export interface ReverseMigrationResult {
  evaluationsProcessed: number;
  resultsProcessed: number;
  assetsConverted: number;
  errors: string[];
}

/**
 * Convert asset URLs back to base64 data URLs
 */
export async function reverseAssetMigration(
  options: ReverseMigrationOptions = {}
): Promise<ReverseMigrationResult> {
  const { evalId, dryRun = false, force = false } = options;
  
  if (isAssetStorageEnabled() && !force) {
    throw new Error(
      'Asset storage is currently enabled. Use --force to override or disable asset storage first.'
    );
  }
  
  const db = getDb();
  const assetStore = getAssetStore();
  const result: ReverseMigrationResult = {
    evaluationsProcessed: 0,
    resultsProcessed: 0,
    assetsConverted: 0,
    errors: [],
  };
  
  // Get evaluations to process
  let evaluations;
  if (evalId) {
    const eval_ = db.select().from(evalsTable).where(eq(evalsTable.id, evalId)).get();
    evaluations = eval_ ? [eval_] : [];
  } else {
    evaluations = db.select().from(evalsTable).all();
  }
  
  logger.info(`Processing ${evaluations.length} evaluations for reverse migration`);
  
  for (const evaluation of evaluations) {
    try {
      logger.debug(`Processing evaluation ${evaluation.id}`);
      result.evaluationsProcessed++;
      
      // Get all results for this evaluation
      const results = db
        .select()
        .from(evalResultsTable)
        .where(eq(evalResultsTable.evalId, evaluation.id))
        .all();
      
      for (const result_ of results) {
        try {
          if (!result_.response) continue;
          
          const response = typeof result_.response === 'string' 
            ? JSON.parse(result_.response) 
            : result_.response;
          
          if (!response?.output) continue;
          
          let output = response.output;
          let modified = false;
          
          // Find all asset URLs
          const assetUrlRegex = /promptfoo:\/\/([^/]+)\/([^/]+)\/([^)\s]+)/g;
          const matches = [...(typeof output === 'string' ? output.matchAll(assetUrlRegex) : [])];
          
          for (const match of matches) {
            const [fullUrl, evalIdFromUrl, resultId, assetId] = match;
            
            try {
              // Load the asset
              const assetData = await assetStore.load(evalIdFromUrl, resultId, assetId);
              const metadata = await assetStore.getMetadata(evalIdFromUrl, resultId, assetId);
              
              // Convert to base64 data URL
              const base64Data = assetData.toString('base64');
              const mimeType = metadata.mimeType || detectMimeType(assetData) || 'application/octet-stream';
              const dataUrl = `data:${mimeType};base64,${base64Data}`;
              
              // Replace the asset URL with data URL
              if (typeof output === 'string') {
                output = output.replace(fullUrl, dataUrl);
                modified = true;
                result.assetsConverted++;
              }
              
              logger.debug(`Converted asset ${assetId} to base64 (${assetData.length} bytes)`);
            } catch (error) {
              logger.warn(`Failed to convert asset ${fullUrl}: ${error}`);
              result.errors.push(`Asset ${fullUrl}: ${error}`);
            }
          }
          
          if (modified && !dryRun) {
            // Update the result
            response.output = output;
            db.update(evalResultsTable)
              .set({ response: JSON.stringify(response) })
              .where(eq(evalResultsTable.id, result_.id))
              .run();
          }
          
          result.resultsProcessed++;
        } catch (error) {
          logger.error(`Failed to process result ${result_.id}: ${error}`);
          result.errors.push(`Result ${result_.id}: ${error}`);
        }
      }
    } catch (error) {
      logger.error(`Failed to process evaluation ${evaluation.id}: ${error}`);
      result.errors.push(`Evaluation ${evaluation.id}: ${error}`);
    }
  }
  
  logger.info('Reverse migration completed', {
    evaluationsProcessed: result.evaluationsProcessed,
    resultsProcessed: result.resultsProcessed,
    assetsConverted: result.assetsConverted,
    errors: result.errors.length,
  });
  
  return result;
}

/**
 * Get statistics about asset usage
 */
export async function getAssetUsageStats(evalId?: string): Promise<{
  totalAssetUrls: number;
  evaluationsWithAssets: number;
  resultsWithAssets: number;
  estimatedSizeIncrease: number;
}> {
  const db = getDb();
  const assetStore = getAssetStore();
  
  let evaluations;
  if (evalId) {
    const eval_ = db.select().from(evalsTable).where(eq(evalsTable.id, evalId)).get();
    evaluations = eval_ ? [eval_] : [];
  } else {
    evaluations = db.select().from(evalsTable).all();
  }
  
  let totalAssetUrls = 0;
  const evaluationsWithAssets = new Set<string>();
  const resultsWithAssets = new Set<string>();
  let estimatedSizeIncrease = 0;
  
  const assetUrlRegex = /promptfoo:\/\/([^/]+)\/([^/]+)\/([^)\s]+)/g;
  
  for (const evaluation of evaluations) {
    const results = db
      .select()
      .from(evalResultsTable)
      .where(eq(evalResultsTable.evalId, evaluation.id))
      .all();
    
    let evalHasAssets = false;
    
    for (const result of results) {
      if (!result.response) continue;
      
      const response = typeof result.response === 'string' 
        ? JSON.parse(result.response) 
        : result.response;
      
      if (!response?.output || typeof response.output !== 'string') continue;
      
      const matches = [...response.output.matchAll(assetUrlRegex)];
      
      if (matches.length > 0) {
        evalHasAssets = true;
        resultsWithAssets.add(result.id);
        totalAssetUrls += matches.length;
        
        // Estimate size increase
        for (const match of matches) {
          const [, evalIdFromUrl, resultId, assetId] = match;
          try {
            const metadata = await assetStore.getMetadata(evalIdFromUrl, resultId, assetId);
            // Base64 encoding increases size by ~33%
            estimatedSizeIncrease += Math.ceil(metadata.size * 1.33);
          } catch (error) {
            // Asset might not exist, skip
          }
        }
      }
    }
    
    if (evalHasAssets) {
      evaluationsWithAssets.add(evaluation.id);
    }
  }
  
  return {
    totalAssetUrls,
    evaluationsWithAssets: evaluationsWithAssets.size,
    resultsWithAssets: resultsWithAssets.size,
    estimatedSizeIncrease,
  };
}