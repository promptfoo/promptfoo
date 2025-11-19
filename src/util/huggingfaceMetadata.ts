/**
 * HuggingFace metadata utilities for fetching model revision information.
 * Used for deduplication of model scans.
 */

import { fetchWithCache } from '../cache';
import logger from '../logger';

/**
 * HuggingFace model metadata containing revision information
 */
export interface HuggingFaceMetadata {
  /** Git SHA-1 of the model revision (40-character hex string) */
  sha: string;
  /** Last modified timestamp in ISO 8601 format */
  lastModified: string;
  /** Model author/organization */
  author: string;
  /** Model ID (e.g., "meta-llama/Llama-2-7b-hf") */
  modelId: string;
}

/**
 * Check if a path is a HuggingFace model reference
 * @param path - Model path to check
 * @returns true if path refers to a HuggingFace model
 */
export function isHuggingFaceModel(path: string): boolean {
  return (
    path.startsWith('hf://') ||
    path.startsWith('https://huggingface.co/') ||
    path.startsWith('https://hf.co/')
  );
}

/**
 * Parse HuggingFace model path into owner and repo
 * @param path - HuggingFace model path (hf://owner/repo or https://huggingface.co/owner/repo)
 * @returns Object with owner and repo, or null if not a valid HuggingFace path
 */
export function parseHuggingFaceModel(path: string): { owner: string; repo: string } | null {
  // Handle hf:// protocol
  if (path.startsWith('hf://')) {
    const parts = path.slice(5).split('/');
    if (parts.length >= 2) {
      return { owner: parts[0], repo: parts[1] };
    }
  }

  // Handle https://huggingface.co/ URLs
  if (path.startsWith('https://huggingface.co/')) {
    const parts = path.slice(23).split('/');
    if (parts.length >= 2) {
      return { owner: parts[0], repo: parts[1] };
    }
  }

  // Handle https://hf.co/ URLs (short form)
  if (path.startsWith('https://hf.co/')) {
    const parts = path.slice(14).split('/');
    if (parts.length >= 2) {
      return { owner: parts[0], repo: parts[1] };
    }
  }

  return null;
}

/**
 * Fetch metadata from HuggingFace Hub API
 * @param modelId - Model ID in format "owner/repo" (e.g., "meta-llama/Llama-2-7b-hf")
 * @returns HuggingFace metadata including Git SHA and last modified time
 * @throws Error if API request fails or model not found
 */
export async function fetchHuggingFaceMetadata(modelId: string): Promise<HuggingFaceMetadata> {
  const url = `https://huggingface.co/api/models/${modelId}`;

  try {
    logger.debug(`Fetching HuggingFace metadata for ${modelId}`);

    const response = await fetchWithCache<any>(
      url,
      {
        method: 'GET',
        headers: {
          'User-Agent': 'promptfoo-cli',
        },
      },
      10000, // 10 second timeout
      'json',
    );

    if (response.status !== 200) {
      throw new Error(`HuggingFace API returned status ${response.status}: ${response.statusText}`);
    }

    const data = response.data;

    // Extract SHA from the API response
    // HuggingFace API returns sha in the root level
    if (!data.sha) {
      throw new Error('HuggingFace API response missing sha field');
    }

    // Extract author (owner)
    const author = data.author || modelId.split('/')[0];

    // Extract last modified time
    const lastModified = data.lastModified || new Date().toISOString();

    return {
      sha: data.sha,
      lastModified,
      author,
      modelId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to fetch HuggingFace metadata for ${modelId}: ${message}`);
    throw new Error(`Failed to fetch HuggingFace metadata: ${message}`);
  }
}

/**
 * Get metadata from HuggingFace model path
 * @param modelPath - HuggingFace model path (hf://owner/repo or https://huggingface.co/owner/repo)
 * @returns HuggingFace metadata or null if not a HuggingFace model
 */
export async function getHuggingFaceMetadata(
  modelPath: string,
): Promise<HuggingFaceMetadata | null> {
  if (!isHuggingFaceModel(modelPath)) {
    return null;
  }

  const parsed = parseHuggingFaceModel(modelPath);
  if (!parsed) {
    logger.warn(`Failed to parse HuggingFace model path: ${modelPath}`);
    return null;
  }

  const modelId = `${parsed.owner}/${parsed.repo}`;
  return await fetchHuggingFaceMetadata(modelId);
}
