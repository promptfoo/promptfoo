import { fetchHuggingFaceDataset } from '../../integrations/huggingfaceDatasets';
import logger from '../../logger';
import { fetchWithProxy } from '../../util/fetch/index';

/**
 * Detect image format from buffer
 */
function detectImageFormat(buffer: Buffer): string {
  // Check JPEG signature
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return 'image/jpeg';
  }
  // Check PNG signature
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  // Check GIF signature
  if (
    buffer.length >= 6 &&
    ((buffer[0] === 0x47 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x38 &&
      buffer[4] === 0x37 &&
      buffer[5] === 0x61) ||
      (buffer[0] === 0x47 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x38 &&
        buffer[4] === 0x39 &&
        buffer[5] === 0x61))
  ) {
    return 'image/gif';
  }
  // Check WebP signature
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }
  // Default to JPEG for unknown formats
  return 'image/jpeg';
}

/**
 * Fetches an image from a URL and converts it to base64
 * @param url - The URL of the image to fetch
 * @param pluginId - The plugin ID for logging purposes
 * @returns Base64 encoded image with data URI prefix, or null on failure
 */
export async function fetchImageAsBase64(url: string, pluginId: string): Promise<string | null> {
  try {
    logger.debug(`[${pluginId}] Fetching image from URL`);
    const response = await fetchWithProxy(url);

    if (!response.ok) {
      logger.warn(`[${pluginId}] Failed to fetch image: ${response.statusText}`);
      return null;
    }

    // Get image as array buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Convert to base64
    const base64 = buffer.toString('base64');

    // Determine MIME type from response headers or detect from buffer
    let contentType = response.headers.get('content-type');
    if (!contentType || contentType === 'binary/octet-stream') {
      contentType = detectImageFormat(buffer);
    }

    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    logger.error(
      `[${pluginId}] Error fetching image: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/**
 * Fisher-Yates shuffle algorithm for unbiased randomization
 * @param array - Array to shuffle
 * @returns Shuffled array (mutates in place and returns same array)
 */
export function fisherYatesShuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Type guard for object with src property
 */
export function hasStringSrc(obj: unknown): obj is { src: string } {
  return (
    typeof obj === 'object' && obj !== null && 'src' in obj && typeof (obj as any).src === 'string'
  );
}

/**
 * Type guard for object with bytes property
 */
export function hasBytes(obj: unknown): obj is { bytes: unknown } {
  return typeof obj === 'object' && obj !== null && 'bytes' in obj;
}

/**
 * Safe string field getter with default value
 */
export function getStringField(field: unknown, defaultValue: string = ''): string {
  return typeof field === 'string' ? field : defaultValue;
}

/**
 * Process image data from various formats to base64
 * @param imageData - The image data (URL, base64, object with src, or bytes)
 * @param pluginId - The plugin ID for logging purposes
 * @returns Base64 encoded image with data URI prefix, or null on failure
 */
export async function processImageData(
  imageData: unknown,
  pluginId: string,
): Promise<string | null> {
  if (typeof imageData === 'string') {
    if (imageData.startsWith('http')) {
      // It's a URL, download and convert to base64
      return await fetchImageAsBase64(imageData, pluginId);
    } else {
      // It's already a suitable string (base64 or data URI)
      return imageData;
    }
  } else if (hasStringSrc(imageData)) {
    // It's an object with an image URL
    logger.debug(`[${pluginId}] Found image URL from src property`);
    return await fetchImageAsBase64(imageData.src, pluginId);
  } else if (hasBytes(imageData)) {
    // Handle bytes format (common in Hugging Face datasets)
    const bytes = imageData.bytes;
    let base64Image: string;
    if (typeof bytes === 'string') {
      // If bytes is already a base64 string - decode it to detect format
      const buffer = Buffer.from(bytes, 'base64');
      const mimeType = detectImageFormat(buffer);
      base64Image = `data:${mimeType};base64,${bytes}`;
    } else if (bytes instanceof Buffer) {
      // If bytes is a Buffer - detect format from buffer
      const mimeType = detectImageFormat(bytes);
      base64Image = `data:${mimeType};base64,${bytes.toString('base64')}`;
    } else {
      logger.warn(`[${pluginId}] Unsupported bytes format for image`);
      return null;
    }
    return base64Image;
  } else {
    logger.warn(`[${pluginId}] Invalid image format`);
    return null;
  }
}

/**
 * Base class for image dataset managers with caching
 */
export abstract class ImageDatasetManager<T> {
  protected datasetCache: T[] | null = null;
  protected abstract pluginId: string;
  protected abstract datasetPath: string;
  protected abstract fetchLimit: number;

  /**
   * Ensure the dataset is loaded into cache
   */
  protected async ensureDatasetLoaded(): Promise<void> {
    if (this.datasetCache !== null) {
      logger.debug(
        `[${this.pluginId}] Using cached dataset with ${this.datasetCache.length} records`,
      );
      return;
    }

    logger.debug(`[${this.pluginId}] Fetching ${this.fetchLimit} records from dataset`);

    try {
      const records = await fetchHuggingFaceDataset(this.datasetPath, this.fetchLimit);

      if (!records || records.length === 0) {
        throw new Error(`No records returned from dataset. Check your Hugging Face API token.`);
      }

      logger.debug(`[${this.pluginId}] Fetched ${records.length} total records`);

      // Process records - to be implemented by subclass
      this.datasetCache = await this.processRecords(records);

      logger.debug(`[${this.pluginId}] Cached ${this.datasetCache.length} processed records`);
    } catch (error) {
      logger.error(
        `[${this.pluginId}] Error fetching dataset: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new Error(
        `Failed to fetch dataset: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Process raw records from Hugging Face into the desired format
   * Must be implemented by subclasses
   */
  protected abstract processRecords(records: any[]): Promise<T[]>;

  /**
   * Get filtered records based on plugin configuration
   * Must be implemented by subclasses
   */
  public abstract getFilteredRecords(limit: number, config?: any): Promise<T[]>;

  /**
   * Clear the cache - useful for testing
   */
  public clearCache(): void {
    this.datasetCache = null;
  }
}
