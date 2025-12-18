/**
 * Media storage abstraction for promptfoo (OSS).
 *
 * OSS uses only the local filesystem for media storage. Cloud deployments can override
 * the provider, but cloud-specific types (e.g., S3) live in the cloud repo.
 */

/**
 * Supported media types
 */
export type MediaType = 'audio' | 'image' | 'video';

/**
 * Metadata associated with stored media
 */
export interface MediaMetadata {
  /** Original filename if available */
  originalFilename?: string;
  /** MIME type (e.g., 'audio/wav', 'image/png') */
  contentType: string;
  /** Media type category */
  mediaType: MediaType;
  /** Size in bytes */
  sizeBytes?: number;
  /** Associated eval ID */
  evalId?: string;
  /** Associated result ID */
  resultId?: string;
  /** Original text content (for audio/image strategies) */
  originalText?: string;
  /** Strategy that generated this media */
  strategyId?: string;
  /** Creation timestamp */
  createdAt?: Date;
  /** Content hash for deduplication */
  contentHash?: string;
}

/**
 * Reference to stored media - this replaces inline base64 data
 */
export interface MediaStorageRef {
  /** Storage provider identifier (filesystem in OSS) */
  provider: string;
  /** Unique key/path in the storage backend */
  key: string;
  /** Content hash for integrity verification */
  contentHash: string;
  /** Media metadata */
  metadata: MediaMetadata;
}

/**
 * Result of a store operation
 */
export interface StoreResult {
  /** Storage reference */
  ref: MediaStorageRef;
  /** Whether this was a new file or deduplicated */
  deduplicated: boolean;
}

/**
 * Configuration for local filesystem storage
 */
export interface LocalStorageConfig {
  /** Base directory for media storage (defaults to ~/.promptfoo/media) */
  basePath?: string;
}

/**
 * Storage configuration
 */
export type StorageConfig = LocalStorageConfig;

/**
 * Storage provider interface
 *
 * Implementations must handle:
 * - Storing binary data with metadata
 * - Retrieving data by key
 * - Content-based deduplication via hash
 * - Deletion
 */
export interface MediaStorageProvider {
  /** Provider identifier (e.g., 'local', 's3') */
  readonly providerId: string;

  /**
   * Store media data
   * @param data - Binary data to store
   * @param metadata - Associated metadata
   * @returns Storage result with reference
   */
  store(data: Buffer, metadata: MediaMetadata): Promise<StoreResult>;

  /**
   * Retrieve media data
   * @param key - Storage key
   * @returns Binary data
   * @throws Error if not found
   */
  retrieve(key: string): Promise<Buffer>;

  /**
   * Check if media exists
   * @param key - Storage key
   */
  exists(key: string): Promise<boolean>;

  /**
   * Delete media
   * @param key - Storage key
   */
  delete(key: string): Promise<void>;

  /**
   * Get a URL for accessing the media (for serving to frontend)
   * @param key - Storage key
   * @param expiresIn - Expiration time in seconds (for signed URLs)
   * @returns URL string or null if not supported
   */
  getUrl(key: string, expiresIn?: number): Promise<string | null>;

  /**
   * Find existing media by content hash (for deduplication)
   * @param contentHash - Hash of the content
   * @returns Storage key if found, null otherwise
   */
  findByHash(contentHash: string): Promise<string | null>;
}

/**
 * Extended MediaData interface that supports both inline data and storage refs
 */
export interface MediaData {
  /** Base64 encoded data (legacy/inline mode) */
  data?: string;
  /** Format/extension (e.g., 'wav', 'png') */
  format: string;
  /** Storage reference (new mode) */
  storageRef?: MediaStorageRef;
}
