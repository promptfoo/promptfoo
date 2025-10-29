/**
 * Revision resolver - unified interface for fetching model revision information
 * from various sources (HuggingFace, S3, local files, etc.)
 */

import logger from '../logger';
import { computeContentHash } from './contentHash';
import {
  getHuggingFaceMetadata,
  isHuggingFaceModel,
  parseHuggingFaceModel,
} from './huggingfaceMetadata';

/**
 * Model revision information for deduplication and tracking
 */
export interface ModelRevisionInfo {
  /** Normalized model identifier (e.g., "meta-llama/Llama-2-7b") */
  modelId: string;

  /** Native revision SHA from source (HF Git SHA, S3 version ID, etc.) - nullable */
  revisionSha: string | null;

  /** SHA-256 hash of actual downloaded content - always present */
  contentHash: string;

  /** Source type: 'huggingface', 's3', 'gcs', 'local', etc. */
  modelSource: string;

  /** Last modified timestamp in milliseconds (Unix epoch) */
  sourceLastModified: number;
}

/**
 * Detect model source type from path
 */
function detectModelSource(modelPath: string): string {
  if (isHuggingFaceModel(modelPath)) {
    return 'huggingface';
  } else if (modelPath.startsWith('s3://')) {
    return 's3';
  } else if (modelPath.startsWith('gs://')) {
    return 'gcs';
  } else if (modelPath.startsWith('models://')) {
    return 'mlflow';
  } else {
    return 'local';
  }
}

/**
 * Extract normalized model ID from path
 */
function extractModelId(modelPath: string, modelSource: string): string {
  switch (modelSource) {
    case 'huggingface': {
      const parsed = parseHuggingFaceModel(modelPath);
      return parsed ? `${parsed.owner}/${parsed.repo}` : modelPath;
    }
    case 's3':
      return modelPath.slice(5); // Remove 's3://'
    case 'gcs':
      return modelPath.slice(5); // Remove 'gs://'
    case 'mlflow':
      return modelPath.slice(9); // Remove 'models://'
    default:
      return modelPath;
  }
}

/**
 * Resolve revision information for a model from any source
 *
 * Strategy:
 * 1. Detect source type (HuggingFace, S3, local, etc.)
 * 2. Try to fetch native revision (HF Git SHA, S3 version ID) if available
 * 3. Always compute content hash from downloaded files
 * 4. Return complete revision info for deduplication
 *
 * @param modelPath - Original model path from user (hf://, s3://, local path, etc.)
 * @param downloadedPath - Local path where model files are located
 * @returns Complete revision information
 */
export async function resolveRevision(
  modelPath: string,
  downloadedPath: string,
): Promise<ModelRevisionInfo> {
  const modelSource = detectModelSource(modelPath);
  const modelId = extractModelId(modelPath, modelSource);

  logger.debug(`Resolving revision for ${modelId} (source: ${modelSource})`);

  let revisionSha: string | null = null;
  let sourceLastModified = Date.now();

  // Try to fetch native revision for HuggingFace models
  if (modelSource === 'huggingface') {
    try {
      const metadata = await getHuggingFaceMetadata(modelPath);
      if (metadata) {
        revisionSha = metadata.sha;
        sourceLastModified = new Date(metadata.lastModified).getTime();
        logger.debug(`Got HuggingFace revision SHA: ${revisionSha}`);
      }
    } catch (error) {
      logger.warn(
        `Failed to fetch HuggingFace metadata for ${modelId}: ${error}. Will rely on content hash only.`,
      );
    }
  }

  // TODO: Add S3 version ID fetching when available
  // if (modelSource === 's3') {
  //   revisionSha = await getS3VersionId(modelPath);
  // }

  // Always compute content hash for verification and universal deduplication
  logger.debug(`Computing content hash for ${downloadedPath}`);
  const contentHash = await computeContentHash(downloadedPath);
  logger.debug(`Content hash: ${contentHash}`);

  return {
    modelId,
    revisionSha,
    contentHash,
    modelSource,
    sourceLastModified,
  };
}

/**
 * Check if a model needs to be scanned by comparing revision info
 * This is a helper function for pre-scan deduplication checks
 *
 * @param revisionInfo - Revision info to check
 * @param existingRevisionSha - Revision SHA from existing scan (if any)
 * @param existingContentHash - Content hash from existing scan (if any)
 * @returns true if model needs scanning, false if already scanned
 */
export function needsScan(
  revisionInfo: ModelRevisionInfo,
  existingRevisionSha: string | null,
  existingContentHash: string | null,
): boolean {
  // If we have a native revision SHA, check against that (fast path)
  if (revisionInfo.revisionSha && existingRevisionSha) {
    return revisionInfo.revisionSha !== existingRevisionSha;
  }

  // Otherwise, check content hash (universal fallback)
  if (existingContentHash) {
    return revisionInfo.contentHash !== existingContentHash;
  }

  // No existing scan found
  return true;
}
