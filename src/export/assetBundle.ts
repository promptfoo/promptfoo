/**
 * Asset Bundle Export Format
 * 
 * Exports evaluations with all referenced assets in a portable bundle format.
 * The bundle can be a ZIP file containing the evaluation data and all assets.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createWriteStream } from 'fs';
import { eq } from 'drizzle-orm';
import { getAssetStore } from '../assets';
import { getDb } from '../database';
import { evalsTable, evalResultsTable } from '../database/tables';
import logger from '../logger';
import { getExtensionFromMimeType } from '../util/mimeTypes';
import type { EvaluateSummaryV3, EvaluateResult } from '../types';

export interface AssetBundleManifest {
  version: '1.0';
  createdAt: number;
  evaluation: {
    id: string;
    description?: string;
    author?: string;
  };
  assets: Array<{
    originalUrl: string;
    bundlePath: string;
    type: 'image' | 'audio';
    mimeType: string;
    size: number;
  }>;
}

export interface ExportAssetBundleOptions {
  evalId: string;
  outputPath: string;
  includeMetadata?: boolean;
}

/**
 * Exports an evaluation with all its assets as a bundle
 */
export async function exportAssetBundle(options: ExportAssetBundleOptions): Promise<void> {
  const { evalId, outputPath, includeMetadata = true } = options;
  
  logger.info(`Exporting asset bundle for evaluation ${evalId} to ${outputPath}`);
  
  // Get evaluation data
  const db = getDb();
  const evalData = db.select().from(evalsTable).where(eq(evalsTable.id, evalId)).get();
    
  if (!evalData) {
    throw new Error(`Evaluation ${evalId} not found`);
  }
  
  // Get all results for this evaluation
  const results = db.select().from(evalResultsTable).where(eq(evalResultsTable.evalId, evalId)).all();
    
  // Find all asset URLs in the results
  const assetUrls = new Set<string>();
  const assetUrlRegex = /promptfoo:\/\/([^/]+)\/([^/]+)\/([^)\s]+)/g;
  
  for (const result of results) {
    const response = typeof result.response === 'string' 
      ? JSON.parse(result.response) 
      : result.response;
      
    if (response?.output) {
      const output = typeof response.output === 'string' 
        ? response.output 
        : JSON.stringify(response.output);
        
      const matches = output.matchAll(assetUrlRegex);
      for (const match of matches) {
        assetUrls.add(match[0]);
      }
    }
  }
  
  logger.info(`Found ${assetUrls.size} assets to bundle`);
  
  // Create ZIP archive
  const archiver = await import('archiver');
  const archive = archiver.default('zip', {
    zlib: { level: 9 } // Maximum compression
  });
  
  const output = createWriteStream(outputPath);
  archive.pipe(output);
  
  const archivePromise = new Promise<void>((resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);
  });
  
  // Prepare manifest
  const manifest: AssetBundleManifest = {
    version: '1.0',
    createdAt: Date.now(),
    evaluation: {
      id: evalId,
      description: evalData.description,
      author: evalData.author,
    },
    assets: [],
  };
  
  // Export evaluation data
  const evalSummary: EvaluateSummaryV3 = {
    version: 3,
    results: evalData.results as EvaluateResult[],
  };
  
  archive.append(JSON.stringify(evalSummary, null, 2), { 
    name: 'evaluation.json' 
  });
  
  // Add all results data if requested
  if (includeMetadata) {
    archive.append(JSON.stringify(results, null, 2), {
      name: 'results.json'
    });
  }
  
  // Export assets
  const assetStore = getAssetStore();
  let assetIndex = 0;
  
  for (const assetUrl of assetUrls) {
    // Use a non-global regex for capturing groups
    const singleMatchRegex = /promptfoo:\/\/([^/]+)\/([^/]+)\/([^)\s]+)/;
    const match = assetUrl.match(singleMatchRegex);
    if (!match) {
      logger.warn(`Asset URL did not match regex: ${assetUrl}`);
      continue;
    }
    
    const [, evalIdFromUrl, resultId, assetId] = match;
    
    try {
      // Load asset
      const assetData = await assetStore.load(evalIdFromUrl, resultId, assetId);
      const metadata = await assetStore.getMetadata(evalIdFromUrl, resultId, assetId);
      
      // Determine file extension from MIME type
      const ext = getExtensionFromMimeType(metadata.mimeType);
      const bundlePath = `assets/${assetIndex}${ext}`;
      
      // Add to archive
      archive.append(assetData, { name: bundlePath });
      
      // Update manifest
      manifest.assets.push({
        originalUrl: assetUrl,
        bundlePath,
        type: metadata.type,
        mimeType: metadata.mimeType,
        size: metadata.size,
      });
      
      assetIndex++;
    } catch (error) {
      logger.warn(`Failed to bundle asset ${assetUrl}:`, error);
    }
  }
  
  // Add manifest
  archive.append(JSON.stringify(manifest, null, 2), {
    name: 'manifest.json'
  });
  
  // Finalize archive
  archive.finalize();
  await archivePromise;
  
  logger.info(`Asset bundle created successfully: ${outputPath}`);
}

/**
 * Imports an asset bundle
 */
export async function importAssetBundle(bundlePath: string): Promise<string> {
  logger.info(`Importing asset bundle from ${bundlePath}`);
  
  const extract = require('extract-zip');
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-import-'));
  
  try {
    // Extract the bundle
    await extract(bundlePath, { dir: tempDir });
    
    // Read manifest
    const manifestPath = path.join(tempDir, 'manifest.json');
    const manifestData = await fs.readFile(manifestPath, 'utf8');
    const manifest: AssetBundleManifest = JSON.parse(manifestData);
    
    // Read evaluation data
    const evalPath = path.join(tempDir, 'evaluation.json');
    const evalData = await fs.readFile(evalPath, 'utf8');
    const evalSummary: EvaluateSummaryV3 = JSON.parse(evalData);
    
    // Generate new evaluation ID
    const newEvalId = `eval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Import assets first
    const assetStore = getAssetStore();
    const assetMapping = new Map<string, string>(); // oldUrl -> newUrl
    
    for (const asset of manifest.assets) {
      const assetPath = path.join(tempDir, asset.bundlePath);
      const assetData = await fs.readFile(assetPath);
      
      // Generate new result ID for this import
      const newResultId = `result-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Save the asset
      const metadata = await assetStore.save(
        assetData,
        asset.type,
        asset.mimeType,
        newEvalId,
        newResultId
      );
      
      // Create mapping from old URL to new URL
      const newUrl = `promptfoo://${newEvalId}/${newResultId}/${metadata.id}`;
      assetMapping.set(asset.originalUrl, newUrl);
    }
    
    // Import evaluation to database
    const db = getDb();
    
    // If results.json exists, use it; otherwise reconstruct from evalSummary
    let results: any[] = [];
    const resultsPath = path.join(tempDir, 'results.json');
    try {
      const resultsData = await fs.readFile(resultsPath, 'utf8');
      results = JSON.parse(resultsData);
    } catch (error) {
      // Reconstruct results from evalSummary if results.json doesn't exist
      if (evalSummary.results && Array.isArray(evalSummary.results)) {
        results = evalSummary.results.map((result: any, index: number) => ({
          id: `result-${index}`,
          eval_id: newEvalId,
          response: JSON.stringify(result.response || result),
        }));
      }
    }
    
    // Update asset URLs in results
    for (const result of results) {
      if (result.response) {
        let response = typeof result.response === 'string' 
          ? JSON.parse(result.response) 
          : result.response;
          
        if (response?.output) {
          let output = response.output;
          
          // Replace old asset URLs with new ones
          for (const [oldUrl, newUrl] of assetMapping) {
            if (typeof output === 'string') {
              output = output.replace(oldUrl, newUrl);
            }
          }
          
          response.output = output;
          result.response = JSON.stringify(response);
        }
      }
    }
    
    // Insert evaluation
    db.insert(evalsTable).values({
      id: newEvalId,
      createdAt: Date.now(),
      author: manifest.evaluation.author || 'Imported',
      description: manifest.evaluation.description || 'Imported evaluation',
      results: evalSummary.results || [],
      config: {},
      prompts: undefined,
    }).run();
    
    // Insert results
    for (const result of results) {
      db.insert(evalResultsTable).values({
        id: result.id || `result-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        evalId: newEvalId,
        response: result.response,
      }).run();
    }
    
    logger.info(`Successfully imported evaluation ${newEvalId} with ${manifest.assets.length} assets`);
    return newEvalId;
    
  } finally {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

