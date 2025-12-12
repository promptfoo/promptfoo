# MinIO Binary Storage Migration Plan

> **Approach**: Forward-fix only. New binary data goes to MinIO; existing inline data remains unchanged and continues to work.

---

## Executive Summary

Replace inline base64 storage in SQLite JSON columns with MinIO object storage references. The system will support both storage modes simultaneously—reading old inline data and writing new data to MinIO. No data migration required.

---

## Table of Contents

1. [Current Architecture](#1-current-architecture)
2. [Target Architecture](#2-target-architecture)
3. [Reference Format Design](#3-reference-format-design)
4. [Implementation: Storage Abstraction Layer](#4-implementation-storage-abstraction-layer)
5. [Implementation: JSON Transformation](#5-implementation-json-transformation)
6. [Implementation: Integration Points](#6-implementation-integration-points)
7. [Implementation: Server Routes](#7-implementation-server-routes)
8. [Implementation: Cleanup on Deletion](#8-implementation-cleanup-on-deletion)
9. [Configuration](#9-configuration)
10. [Backwards Compatibility](#10-backwards-compatibility)
11. [Error Handling](#11-error-handling)
12. [Testing Strategy](#12-testing-strategy)
13. [File Structure](#13-file-structure)
14. [Implementation Order](#14-implementation-order)
15. [Open Questions](#15-open-questions)
16. [Future Enhancements](#16-future-enhancements)

---

## 1. Current Architecture

### 1.1 How Binary Data Flows Today

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────┐
│  File on disk   │ ──▶ │  evaluatorHelpers.ts │ ──▶ │  SQLite DB  │
│  (image, audio) │     │  fs.readFileSync()   │     │  JSON TEXT  │
└─────────────────┘     │  → base64 → dataURL  │     │  columns    │
                        └──────────────────────┘     └─────────────┘
```

### 1.2 Key Files and Entry Points

| File                       | Lines   | Role                                                                    |
| -------------------------- | ------- | ----------------------------------------------------------------------- |
| `src/evaluatorHelpers.ts`  | 299-330 | Reads files, converts to base64, creates data URLs                      |
| `src/models/evalResult.ts` | 61-114  | `createFromEvaluateResult()` - persists `testCase` and `response` to DB |
| `src/models/evalResult.ts` | 305-355 | `toEvaluateResult()` - retrieves data for API                           |
| `src/util/dataUrl.ts`      | \*      | Data URL parsing utilities                                              |
| `src/database/tables.ts`   | \*      | Drizzle schema definitions                                              |

### 1.3 Data Structures Containing Binary Data

```typescript
// In testCase.vars
{ "image": "data:image/png;base64,iVBORw0KGgo..." }

// In response.audio
{ "audio": { "data": "base64audiodata...", "format": "mp3" } }

// In response.output (sometimes contains images)
{ "output": "data:image/jpeg;base64,..." }
```

### 1.4 Database Schema (Relevant Columns)

```typescript
// src/database/tables.ts
export const evalResultsTable = sqliteTable('eval_results', {
  // ...
  response: text('response', { mode: 'json' }).$type<ProviderResponse | null>(),
  testCase: text('test_case', { mode: 'json' }).$type<AtomicTestCase>(),
  // ...
});
```

Binary data is embedded within these JSON columns as base64 strings.

---

## 2. Target Architecture

### 2.1 New Data Flow

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────┐
│  File on disk   │ ──▶ │  BinaryStorageService│ ──▶ │   MinIO     │
│  (image, audio) │     │  store() → reference │     │  (binary)   │
└─────────────────┘     └──────────┬───────────┘     └──────┬──────┘
                                   │                        │
                                   ▼                        ▼
                        ┌──────────────────────┐     ┌─────────────┐
                        │  Reference stored    │ ──▶ │  SQLite DB  │
                        │  pf://bucket/key     │     │  (ref only) │
                        └──────────────────────┘     └─────────────┘
```

### 2.2 Read Path (Supports Both Formats)

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────┐
│  API Request    │ ──▶ │  BinaryStorageService│ ──▶ │  Response   │
└─────────────────┘     │  resolve()           │     │  (data URL) │
                        └──────────────────────┘     └─────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
            ┌───────────────┐             ┌───────────────┐
            │ Inline base64 │             │ MinIO fetch   │
            │ (passthrough) │             │ → data URL    │
            └───────────────┘             └───────────────┘
```

### 2.3 Key Design Decisions

1. **Forward-fix only**: No migration of existing data
2. **Dual-read support**: System reads both inline and MinIO references
3. **Threshold-based**: Only files above threshold go to MinIO
4. **Graceful fallback**: If MinIO unavailable, fall back to inline

---

## 3. Reference Format Design

### 3.1 URI Scheme

```
pf://<bucket>/<evalId>/<hash>.<ext>

Examples:
pf://promptfoo/eval-abc123/a1b2c3d4e5f6.png
pf://promptfoo/eval-abc123/f7e8d9c0b1a2.mp3
pf://promptfoo/eval-xyz789/deadbeef1234.jpg
```

### 3.2 Detection Functions

```typescript
function isMinioReference(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('pf://');
}

function isInlineDataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:');
}

function isBinaryValue(value: unknown): value is string {
  return isMinioReference(value) || isInlineDataUrl(value);
}
```

### 3.3 Why This Format?

| Aspect              | Rationale                                                  |
| ------------------- | ---------------------------------------------------------- |
| `pf://` prefix      | Unambiguous, distinguishes from `data:` URLs and `http://` |
| Includes bucket     | Self-contained, can support multiple buckets               |
| evalId in path      | Enables efficient cleanup when eval deleted                |
| Hash-based filename | Content-addressable, deduplication possible                |
| Extension preserved | MIME type recoverable without metadata lookup              |

---

## 4. Implementation: Storage Abstraction Layer

### 4.1 Directory Structure

```
src/storage/
├── index.ts              # Main exports, getStorageProvider()
├── types.ts              # Interfaces and types
├── minioStorage.ts       # MinIO implementation
├── inlineStorage.ts      # Passthrough for backwards compat
└── transform.ts          # JSON extraction/resolution utilities
```

### 4.2 Core Interfaces

```typescript
// src/storage/types.ts

export interface StoredBinaryMetadata {
  mimeType: string;
  size: number;
  hash: string;
  evalId: string;
  createdAt: Date;
}

export interface BinaryStorageProvider {
  /**
   * Store binary data and return a reference URI
   */
  store(
    data: Buffer,
    metadata: { evalId: string; mimeType: string; filename?: string },
  ): Promise<string>;

  /**
   * Retrieve binary data by reference
   */
  retrieve(reference: string): Promise<{ data: Buffer; mimeType: string }>;

  /**
   * Delete all binaries associated with an eval
   */
  deleteByEvalId(evalId: string): Promise<void>;

  /**
   * Check if a reference exists
   */
  exists(reference: string): Promise<boolean>;

  /**
   * Get a URL that can be used to serve the binary
   * (for MinIO, this is a proxy path; could be presigned URL)
   */
  getServeUrl(reference: string): string;
}

export interface MinioConfig {
  endpoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
}
```

### 4.3 MinIO Storage Implementation

```typescript
// src/storage/minioStorage.ts

import { Client } from 'minio';
import { createHash } from 'crypto';
import type { BinaryStorageProvider, MinioConfig } from './types';
import logger from '../logger';

export class MinioStorageProvider implements BinaryStorageProvider {
  private client: Client;
  private bucket: string;
  private initialized: boolean = false;

  constructor(private config: MinioConfig) {
    this.client = new Client({
      endPoint: config.endpoint,
      port: config.port,
      useSSL: config.useSSL,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    });
    this.bucket = config.bucket;
  }

  private async ensureBucket(): Promise<void> {
    if (this.initialized) return;

    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(this.bucket);
      logger.info(`Created MinIO bucket: ${this.bucket}`);
    }
    this.initialized = true;
  }

  async store(
    data: Buffer,
    metadata: { evalId: string; mimeType: string; filename?: string },
  ): Promise<string> {
    await this.ensureBucket();

    const hash = createHash('sha256').update(data).digest('hex').slice(0, 16);
    const ext = this.getExtensionFromMimeType(metadata.mimeType);
    const key = `${metadata.evalId}/${hash}.${ext}`;

    await this.client.putObject(this.bucket, key, data, data.length, {
      'Content-Type': metadata.mimeType,
      'x-amz-meta-eval-id': metadata.evalId,
      'x-amz-meta-original-filename': metadata.filename || '',
    });

    logger.debug(`Stored binary in MinIO: ${key} (${data.length} bytes)`);
    return `pf://${this.bucket}/${key}`;
  }

  async retrieve(reference: string): Promise<{ data: Buffer; mimeType: string }> {
    const { bucket, key } = this.parseReference(reference);

    const stream = await this.client.getObject(bucket, key);
    const stat = await this.client.statObject(bucket, key);

    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    return {
      data: Buffer.concat(chunks),
      mimeType: stat.metaData['content-type'] || this.getMimeTypeFromKey(key),
    };
  }

  async deleteByEvalId(evalId: string): Promise<void> {
    const prefix = `${evalId}/`;
    const objects: string[] = [];

    const stream = this.client.listObjects(this.bucket, prefix, true);
    for await (const obj of stream) {
      if (obj.name) {
        objects.push(obj.name);
      }
    }

    if (objects.length > 0) {
      await this.client.removeObjects(this.bucket, objects);
      logger.debug(`Deleted ${objects.length} objects for eval ${evalId}`);
    }
  }

  async exists(reference: string): Promise<boolean> {
    try {
      const { bucket, key } = this.parseReference(reference);
      await this.client.statObject(bucket, key);
      return true;
    } catch {
      return false;
    }
  }

  getServeUrl(reference: string): string {
    // Return a path that our server will proxy
    return `/api/storage/${encodeURIComponent(reference)}`;
  }

  private parseReference(reference: string): { bucket: string; key: string } {
    const match = reference.match(/^pf:\/\/([^/]+)\/(.+)$/);
    if (!match) {
      throw new Error(`Invalid storage reference: ${reference}`);
    }
    return { bucket: match[1], key: match[2] };
  }

  private getExtensionFromMimeType(mimeType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/bmp': 'bmp',
      'image/tiff': 'tiff',
      'image/x-icon': 'ico',
      'image/avif': 'avif',
      'image/heic': 'heic',
      'image/svg+xml': 'svg',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/aac': 'aac',
      'audio/flac': 'flac',
      'audio/ogg': 'ogg',
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'video/quicktime': 'mov',
      'application/octet-stream': 'bin',
    };
    return map[mimeType] || 'bin';
  }

  private getMimeTypeFromKey(key: string): string {
    const ext = key.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      mp4: 'video/mp4',
    };
    return map[ext || ''] || 'application/octet-stream';
  }
}
```

### 4.4 Inline Storage Implementation (Default/Fallback)

```typescript
// src/storage/inlineStorage.ts

import type { BinaryStorageProvider } from './types';
import { parseDataUrl } from '../util/dataUrl';

/**
 * "No-op" storage that keeps data inline as data URLs.
 * Used when MinIO is not configured, or as fallback.
 */
export class InlineStorageProvider implements BinaryStorageProvider {
  async store(data: Buffer, metadata: { evalId: string; mimeType: string }): Promise<string> {
    // Return data URL directly - no external storage
    return `data:${metadata.mimeType};base64,${data.toString('base64')}`;
  }

  async retrieve(reference: string): Promise<{ data: Buffer; mimeType: string }> {
    const parsed = parseDataUrl(reference);
    if (!parsed) {
      throw new Error(`Invalid inline data URL: ${reference.slice(0, 50)}...`);
    }
    return {
      data: Buffer.from(parsed.base64Data, 'base64'),
      mimeType: parsed.mimeType,
    };
  }

  async deleteByEvalId(_evalId: string): Promise<void> {
    // No-op: inline data is deleted automatically with the DB row
  }

  async exists(_reference: string): Promise<boolean> {
    // Inline data always "exists" if the reference is valid
    return true;
  }

  getServeUrl(reference: string): string {
    // Data URL can be used directly by the browser
    return reference;
  }
}
```

### 4.5 Storage Service (Unified Interface)

```typescript
// src/storage/index.ts

import { getEnvString, getEnvInt, getEnvBool } from '../envars';
import { MinioStorageProvider } from './minioStorage';
import { InlineStorageProvider } from './inlineStorage';
import type { BinaryStorageProvider } from './types';
import { isDataUrl } from '../util/dataUrl';
import logger from '../logger';

export type { BinaryStorageProvider } from './types';

let storageProvider: BinaryStorageProvider | null = null;

export function getStorageProvider(): BinaryStorageProvider {
  if (storageProvider) {
    return storageProvider;
  }

  const backend = getEnvString('PROMPTFOO_STORAGE_BACKEND', 'inline');

  if (backend === 'minio' || backend === 's3') {
    const endpoint = getEnvString('PROMPTFOO_MINIO_ENDPOINT', '');
    const accessKey = getEnvString('PROMPTFOO_MINIO_ACCESS_KEY', '');
    const secretKey = getEnvString('PROMPTFOO_MINIO_SECRET_KEY', '');

    if (!endpoint || !accessKey || !secretKey) {
      logger.warn(
        'MinIO storage backend selected but credentials not configured. Falling back to inline storage.',
      );
      storageProvider = new InlineStorageProvider();
    } else {
      storageProvider = new MinioStorageProvider({
        endpoint,
        port: getEnvInt('PROMPTFOO_MINIO_PORT', 9000),
        useSSL: getEnvBool('PROMPTFOO_MINIO_USE_SSL', false),
        accessKey,
        secretKey,
        bucket: getEnvString('PROMPTFOO_MINIO_BUCKET', 'promptfoo'),
      });
      logger.info(`Using MinIO storage backend: ${endpoint}`);
    }
  } else {
    storageProvider = new InlineStorageProvider();
  }

  return storageProvider;
}

/**
 * Reset storage provider (useful for testing)
 */
export function resetStorageProvider(): void {
  storageProvider = null;
}

/**
 * Check if a value is a MinIO reference
 */
export function isStorageReference(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('pf://');
}

/**
 * Check if a value contains binary data (either inline or reference)
 */
export function isBinaryValue(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return isStorageReference(value) || isDataUrl(value);
}

/**
 * Get the storage threshold in bytes.
 * Files larger than this will be stored in MinIO (if configured).
 */
export function getStorageThreshold(): number {
  return getEnvInt('PROMPTFOO_STORAGE_THRESHOLD', 50 * 1024); // 50KB default
}

/**
 * Check if MinIO storage is enabled and configured
 */
export function isMinioEnabled(): boolean {
  const provider = getStorageProvider();
  return provider instanceof MinioStorageProvider;
}
```

---

## 5. Implementation: JSON Transformation

### 5.1 Extract Binaries for Storage

```typescript
// src/storage/transform.ts

import { getStorageProvider, getStorageThreshold, isStorageReference } from './index';
import { isDataUrl, parseDataUrl } from '../util/dataUrl';
import type { BinaryStorageProvider } from './types';
import logger from '../logger';

interface ExtractedBinary {
  path: string;
  data: Buffer;
  mimeType: string;
}

interface ExtractionResult {
  transformed: any;
  binaries: ExtractedBinary[];
}

/**
 * Deep scan an object and identify large binary data URLs for extraction.
 * Returns transformed object with placeholders and list of binaries to store.
 */
export function extractBinariesForStorage(
  obj: any,
  options: { threshold?: number } = {},
): ExtractionResult {
  const threshold = options.threshold ?? getStorageThreshold();
  const binaries: ExtractedBinary[] = [];
  let placeholderIndex = 0;

  function walk(value: any, path: string): any {
    if (value === null || value === undefined) {
      return value;
    }

    // Check for data URL that exceeds threshold
    if (typeof value === 'string' && isDataUrl(value)) {
      const parsed = parseDataUrl(value);
      if (parsed) {
        const data = Buffer.from(parsed.base64Data, 'base64');
        if (data.length >= threshold) {
          const placeholder = `__BINARY_PLACEHOLDER_${placeholderIndex++}__`;
          binaries.push({ path: placeholder, data, mimeType: parsed.mimeType });
          return placeholder;
        }
      }
      // Keep small data URLs inline
      return value;
    }

    // Check for raw base64 in audio.data field (special case)
    if (typeof value === 'string' && path.endsWith('.audio.data')) {
      // This is likely raw base64 audio data
      const data = Buffer.from(value, 'base64');
      if (data.length >= threshold) {
        const placeholder = `__BINARY_PLACEHOLDER_${placeholderIndex++}__`;
        binaries.push({ path: placeholder, data, mimeType: 'audio/mpeg' });
        return placeholder;
      }
      return value;
    }

    // Recurse into arrays
    if (Array.isArray(value)) {
      return value.map((item, idx) => walk(item, `${path}[${idx}]`));
    }

    // Recurse into objects
    if (typeof value === 'object') {
      const result: any = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = walk(val, path ? `${path}.${key}` : key);
      }
      return result;
    }

    return value;
  }

  const transformed = walk(obj, '');
  return { transformed, binaries };
}

/**
 * Store extracted binaries and replace placeholders with references.
 */
export async function storeExtractedBinaries(
  obj: any,
  binaries: ExtractedBinary[],
  evalId: string,
  storage: BinaryStorageProvider,
): Promise<any> {
  if (binaries.length === 0) {
    return obj;
  }

  // Store all binaries and collect references
  const placeholderToReference = new Map<string, string>();

  await Promise.all(
    binaries.map(async ({ path: placeholder, data, mimeType }) => {
      try {
        const reference = await storage.store(data, { evalId, mimeType });
        placeholderToReference.set(placeholder, reference);
      } catch (error) {
        logger.warn(`Failed to store binary, keeping inline`, { error });
        // Fall back to inline data URL
        placeholderToReference.set(
          placeholder,
          `data:${mimeType};base64,${data.toString('base64')}`,
        );
      }
    }),
  );

  // Replace placeholders with references
  return replacePlaceholders(obj, placeholderToReference);
}

function replacePlaceholders(obj: any, mapping: Map<string, string>): any {
  if (typeof obj === 'string' && obj.startsWith('__BINARY_PLACEHOLDER_')) {
    return mapping.get(obj) ?? obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => replacePlaceholders(item, mapping));
  }

  if (typeof obj === 'object' && obj !== null) {
    const result: any = {};
    for (const [key, val] of Object.entries(obj)) {
      result[key] = replacePlaceholders(val, mapping);
    }
    return result;
  }

  return obj;
}
```

### 5.2 Resolve References on Read

```typescript
// src/storage/transform.ts (continued)

/**
 * Deep scan an object and resolve MinIO references back to data URLs.
 * Supports both old inline data (passthrough) and new references (fetch).
 */
export async function resolveStorageReferences(obj: any): Promise<any> {
  const storage = getStorageProvider();
  const cache = new Map<string, string>(); // Cache resolved references

  async function walk(value: any): Promise<any> {
    if (value === null || value === undefined) {
      return value;
    }

    // MinIO reference - fetch and convert to data URL
    if (isStorageReference(value)) {
      // Check cache first
      if (cache.has(value)) {
        return cache.get(value);
      }

      try {
        const { data, mimeType } = await storage.retrieve(value);
        const dataUrl = `data:${mimeType};base64,${data.toString('base64')}`;
        cache.set(value, dataUrl);
        return dataUrl;
      } catch (error) {
        logger.error(`Failed to retrieve storage reference: ${value}`, { error });
        // Return reference as-is if fetch fails (frontend will show error)
        return value;
      }
    }

    // Already a data URL - passthrough
    if (typeof value === 'string' && isDataUrl(value)) {
      return value;
    }

    // Recurse into arrays (parallel resolution)
    if (Array.isArray(value)) {
      return Promise.all(value.map(walk));
    }

    // Recurse into objects (parallel resolution)
    if (typeof value === 'object') {
      const entries = Object.entries(value);
      const resolvedEntries = await Promise.all(
        entries.map(async ([key, val]) => [key, await walk(val)] as const),
      );
      return Object.fromEntries(resolvedEntries);
    }

    return value;
  }

  return walk(obj);
}

/**
 * Process an object for storage: extract large binaries and store in MinIO.
 * This is the main entry point for the write path.
 */
export async function processForStorage(obj: any, evalId: string): Promise<any> {
  const storage = getStorageProvider();

  // If using inline storage, no processing needed
  if (!(storage instanceof (await import('./minioStorage')).MinioStorageProvider)) {
    return obj;
  }

  const { transformed, binaries } = extractBinariesForStorage(obj);

  if (binaries.length === 0) {
    return obj;
  }

  return storeExtractedBinaries(transformed, binaries, evalId, storage);
}
```

---

## 6. Implementation: Integration Points

### 6.1 Modify `EvalResult.createFromEvaluateResult()`

```typescript
// src/models/evalResult.ts

import { processForStorage } from '../storage/transform';

export default class EvalResult {
  static async createFromEvaluateResult(
    evalId: string,
    result: EvaluateResult,
    opts?: { persist: boolean },
  ) {
    const persist = opts?.persist == null ? true : opts.persist;
    const {
      prompt,
      error,
      score,
      latencyMs,
      success,
      provider,
      gradingResult,
      namedScores,
      cost,
      metadata,
      failureReason,
      testCase,
    } = result;

    // NEW: Process testCase and response to extract binaries to MinIO
    const processedTestCase = await processForStorage(
      {
        ...testCase,
        ...(testCase.provider && {
          provider: sanitizeProvider(testCase.provider),
        }),
      },
      evalId,
    );
    const processedResponse = await processForStorage(result.response, evalId);

    const args = {
      id: randomUUID(),
      evalId,
      testCase: processedTestCase, // Use processed version
      promptIdx: result.promptIdx,
      testIdx: result.testIdx,
      prompt,
      promptId: hashPrompt(prompt),
      error: error?.toString(),
      success,
      score: score == null ? 0 : score,
      response: processedResponse || null, // Use processed version
      gradingResult: gradingResult || null,
      namedScores,
      provider: sanitizeProvider(provider),
      latencyMs,
      cost,
      metadata,
      failureReason,
    };

    if (persist) {
      const db = getDb();
      const dbResult = await db.insert(evalResultsTable).values(args).returning();
      return new EvalResult({ ...dbResult[0], persisted: true });
    }
    return new EvalResult(args);
  }

  // ... rest of class unchanged
}
```

### 6.2 Modify `EvalResult.toEvaluateResult()`

The `toEvaluateResult()` method needs to become async to resolve references:

```typescript
// src/models/evalResult.ts

import { resolveStorageReferences } from '../storage/transform';

export default class EvalResult {
  // ... existing code ...

  async toEvaluateResult(): Promise<EvaluateResult> {
    const shouldStripPromptText = getEnvBool('PROMPTFOO_STRIP_PROMPT_TEXT', false);
    const shouldStripResponseOutput = getEnvBool('PROMPTFOO_STRIP_RESPONSE_OUTPUT', false);
    const shouldStripTestVars = getEnvBool('PROMPTFOO_STRIP_TEST_VARS', false);
    const shouldStripGradingResult = getEnvBool('PROMPTFOO_STRIP_GRADING_RESULT', false);
    const shouldStripMetadata = getEnvBool('PROMPTFOO_STRIP_METADATA', false);

    // Resolve any storage references in response and testCase
    const resolvedResponse = shouldStripResponseOutput
      ? { ...this.response, output: '[output stripped]' }
      : await resolveStorageReferences(this.response);

    const resolvedTestCase = shouldStripTestVars
      ? { ...this.testCase, vars: undefined }
      : await resolveStorageReferences(this.testCase);

    const prompt = shouldStripPromptText
      ? { ...this.prompt, raw: '[prompt stripped]' }
      : this.prompt;

    return {
      cost: this.cost,
      description: this.description || undefined,
      error: this.error || undefined,
      gradingResult: shouldStripGradingResult ? null : this.gradingResult,
      id: this.id,
      latencyMs: this.latencyMs,
      namedScores: this.namedScores,
      prompt,
      promptId: this.promptId,
      promptIdx: this.promptIdx,
      provider: { id: this.provider.id, label: this.provider.label },
      response: resolvedResponse,
      score: this.score,
      success: this.success,
      testCase: resolvedTestCase,
      testIdx: this.testIdx,
      vars: shouldStripTestVars ? {} : resolvedTestCase.vars || {},
      metadata: shouldStripMetadata ? {} : this.metadata,
      failureReason: this.failureReason,
    };
  }
}
```

### 6.3 Update Callers of `toEvaluateResult()`

Since `toEvaluateResult()` is now async, all callers need to be updated:

```typescript
// Before
const result = evalResult.toEvaluateResult();

// After
const result = await evalResult.toEvaluateResult();
```

Search for all usages and update:

- `src/server/routes/eval.ts`
- `src/evaluator.ts`
- Any other files that call this method

---

## 7. Implementation: Server Routes

### 7.1 Binary Serving Endpoint

```typescript
// src/server/routes/storage.ts

import { Router } from 'express';
import { getStorageProvider, isStorageReference } from '../../storage';
import logger from '../../logger';

const router = Router();

/**
 * GET /api/storage/:reference
 * Serve binary content directly from storage
 */
router.get('/:reference', async (req, res) => {
  const reference = decodeURIComponent(req.params.reference);

  if (!isStorageReference(reference)) {
    return res.status(400).json({ error: 'Invalid storage reference' });
  }

  try {
    const storage = getStorageProvider();
    const { data, mimeType } = await storage.retrieve(reference);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', data.length);
    // Cache immutable content for 1 year (content-addressed by hash)
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(data);
  } catch (error) {
    logger.error('Failed to serve storage reference', { reference, error });
    res.status(404).json({ error: 'Binary not found' });
  }
});

export default router;
```

### 7.2 Register Route in Server

```typescript
// src/server/index.ts

import storageRoutes from './routes/storage';

// ... existing setup ...

// Add storage routes
app.use('/api/storage', storageRoutes);
```

---

## 8. Implementation: Cleanup on Deletion

### 8.1 Modify Eval Deletion

When an evaluation is deleted, we need to clean up associated MinIO objects:

```typescript
// src/util/database.ts (or wherever evals are deleted)

import { getStorageProvider } from '../storage';

export async function deleteEval(evalId: string): Promise<void> {
  const db = getDb();
  const storage = getStorageProvider();

  // Delete binaries from MinIO first (if using MinIO)
  try {
    await storage.deleteByEvalId(evalId);
  } catch (error) {
    logger.warn(`Failed to delete MinIO objects for eval ${evalId}`, { error });
    // Continue with database deletion even if MinIO cleanup fails
  }

  // Delete from database
  await db.transaction(async (tx) => {
    await tx.delete(evalResultsTable).where(eq(evalResultsTable.evalId, evalId));
    await tx.delete(evalsTable).where(eq(evalsTable.id, evalId));
  });
}
```

### 8.2 Batch Deletion Support

For bulk operations:

```typescript
export async function deleteEvals(evalIds: string[]): Promise<void> {
  const storage = getStorageProvider();

  // Clean up MinIO objects in parallel
  await Promise.allSettled(evalIds.map((evalId) => storage.deleteByEvalId(evalId)));

  // Delete from database
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(evalResultsTable).where(inArray(evalResultsTable.evalId, evalIds));
    await tx.delete(evalsTable).where(inArray(evalsTable.id, evalIds));
  });
}
```

---

## 9. Configuration

### 9.1 Environment Variables

```bash
# Storage backend: 'inline' (default) or 'minio'/'s3'
PROMPTFOO_STORAGE_BACKEND=minio

# MinIO connection settings
PROMPTFOO_MINIO_ENDPOINT=localhost
PROMPTFOO_MINIO_PORT=9000
PROMPTFOO_MINIO_USE_SSL=false
PROMPTFOO_MINIO_ACCESS_KEY=minioadmin
PROMPTFOO_MINIO_SECRET_KEY=minioadmin
PROMPTFOO_MINIO_BUCKET=promptfoo

# Size threshold for external storage (bytes)
# Files smaller than this stay inline in the database
PROMPTFOO_STORAGE_THRESHOLD=51200  # 50KB default
```

### 9.2 Docker Compose for Development

```yaml
# docker-compose.yml
version: '3.8'

services:
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    ports:
      - '9000:9000' # API
      - '9001:9001' # Console
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio_data:/data
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:9000/minio/health/live']
      interval: 30s
      timeout: 20s
      retries: 3

  # Optional: Initialize bucket on startup
  minio-init:
    image: minio/mc:latest
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
      mc alias set myminio http://minio:9000 minioadmin minioadmin;
      mc mb myminio/promptfoo --ignore-existing;
      exit 0;
      "

volumes:
  minio_data:
```

### 9.3 Example .env File

```bash
# .env.minio (for development)
PROMPTFOO_STORAGE_BACKEND=minio
PROMPTFOO_MINIO_ENDPOINT=localhost
PROMPTFOO_MINIO_PORT=9000
PROMPTFOO_MINIO_USE_SSL=false
PROMPTFOO_MINIO_ACCESS_KEY=minioadmin
PROMPTFOO_MINIO_SECRET_KEY=minioadmin
PROMPTFOO_MINIO_BUCKET=promptfoo
PROMPTFOO_STORAGE_THRESHOLD=51200
```

---

## 10. Backwards Compatibility

### 10.1 Read Path Compatibility

| Data Format                 | Detection             | Handling                              |
| --------------------------- | --------------------- | ------------------------------------- |
| `data:image/png;base64,...` | `startsWith('data:')` | Passthrough (existing behavior)       |
| `pf://bucket/path/file.ext` | `startsWith('pf://')` | Fetch from MinIO, convert to data URL |
| Raw base64 (audio.data)     | Path-based detection  | Passthrough (existing behavior)       |

### 10.2 Write Path Compatibility

| Storage Backend          | Configuration       | Behavior                            |
| ------------------------ | ------------------- | ----------------------------------- |
| `inline` (default)       | No config needed    | Current behavior, data URLs in JSON |
| `minio`                  | Full MinIO config   | Large files → MinIO, small → inline |
| `minio` (partial config) | Missing credentials | Falls back to inline with warning   |

### 10.3 Mixed Data Support

A single evaluation can contain both:

- **Old results**: Inline data URLs (from before MinIO was enabled)
- **New results**: MinIO references (after MinIO was enabled)

The read path handles both transparently.

---

## 11. Error Handling

### 11.1 MinIO Unavailable on Write

```typescript
try {
  reference = await storage.store(data, metadata);
} catch (error) {
  logger.warn('MinIO storage failed, falling back to inline', {
    error,
    evalId: metadata.evalId,
    size: data.length,
  });
  // Fall back to inline storage
  reference = `data:${metadata.mimeType};base64,${data.toString('base64')}`;
}
```

### 11.2 MinIO Unavailable on Read

```typescript
try {
  const { data, mimeType } = await storage.retrieve(reference);
  return `data:${mimeType};base64,${data.toString('base64')}`;
} catch (error) {
  logger.error('Failed to retrieve from MinIO', { reference, error });
  // Return reference as-is - frontend will show error/placeholder
  // Could also return a placeholder image/error message
  return reference;
}
```

### 11.3 Cleanup Failures

```typescript
try {
  await storage.deleteByEvalId(evalId);
} catch (error) {
  // Log but don't fail - orphaned objects can be cleaned up later
  logger.warn(`MinIO cleanup failed for eval ${evalId}`, { error });
  // Could queue for retry or manual cleanup
}
```

---

## 12. Testing Strategy

### 12.1 Unit Tests

```typescript
// test/storage/minioStorage.test.ts
describe('MinioStorageProvider', () => {
  it('should store binary data and return reference');
  it('should retrieve stored binary data');
  it('should generate correct reference format');
  it('should delete all objects for an evalId');
  it('should handle non-existent references gracefully');
  it('should detect correct MIME type from extension');
});

// test/storage/inlineStorage.test.ts
describe('InlineStorageProvider', () => {
  it('should return data URL as reference');
  it('should parse data URL on retrieve');
  it('should be no-op for deleteByEvalId');
});

// test/storage/transform.test.ts
describe('extractBinariesForStorage', () => {
  it('should extract data URLs above threshold');
  it('should leave small data URLs inline');
  it('should handle nested objects');
  it('should handle arrays');
  it('should handle response.audio.data field');
  it('should respect custom threshold');
});

describe('resolveStorageReferences', () => {
  it('should resolve pf:// references to data URLs');
  it('should passthrough existing data URLs');
  it('should handle mixed content');
  it('should handle nested references');
  it('should cache repeated references');
});
```

### 12.2 Integration Tests

```typescript
// test/storage/integration.test.ts
describe('Storage Integration', () => {
  describe('with MinIO backend', () => {
    beforeAll(async () => {
      // Start MinIO container or use test instance
    });

    it('should store and retrieve through EvalResult');
    it('should clean up on eval deletion');
    it('should handle concurrent operations');
  });

  describe('with inline backend', () => {
    it('should work identically to current behavior');
    it('should not require MinIO connection');
  });

  describe('mixed data', () => {
    it('should read old inline data');
    it('should write new data to MinIO');
    it('should serve both in same response');
  });
});
```

### 12.3 Manual Testing Checklist

- [ ] Run eval with images, verify stored in MinIO (check MinIO console)
- [ ] View results in web UI, verify images display correctly
- [ ] Delete eval, verify MinIO objects cleaned up
- [ ] Disable MinIO (`PROMPTFOO_STORAGE_BACKEND=inline`), verify fallback
- [ ] Old evals (created before MinIO) still display correctly
- [ ] Mixed eval (some inline, some MinIO) displays correctly
- [ ] Large image (>threshold) goes to MinIO
- [ ] Small image (<threshold) stays inline
- [ ] Audio data in `response.audio.data` is handled correctly
- [ ] Server restart doesn't lose references
- [ ] Multiple concurrent evals don't conflict

---

## 13. File Structure

```
src/
├── storage/
│   ├── index.ts              # Main exports, getStorageProvider()
│   ├── types.ts              # Interfaces (BinaryStorageProvider, etc.)
│   ├── minioStorage.ts       # MinIO implementation
│   ├── inlineStorage.ts      # Passthrough implementation
│   └── transform.ts          # extractBinaries, resolveReferences
├── server/
│   └── routes/
│       └── storage.ts        # GET /api/storage/:reference
├── models/
│   └── evalResult.ts         # Modified: processForStorage, resolveStorageReferences
├── util/
│   ├── dataUrl.ts            # Existing (unchanged)
│   └── database.ts           # Modified: cleanup on deletion
└── evaluatorHelpers.ts       # Unchanged (processing happens in EvalResult)

test/
└── storage/
    ├── minioStorage.test.ts
    ├── inlineStorage.test.ts
    ├── transform.test.ts
    └── integration.test.ts
```

---

## 14. Implementation Order

### Phase 1: Storage Abstraction (Foundation)

1. Create `src/storage/types.ts` - interfaces
2. Create `src/storage/inlineStorage.ts` - default implementation
3. Create `src/storage/index.ts` - factory and utilities
4. Create `src/storage/minioStorage.ts` - MinIO implementation
5. Write unit tests for storage providers

**Estimated time**: 3-4 hours

### Phase 2: JSON Transformation

1. Create `src/storage/transform.ts` - extraction and resolution
2. Write unit tests for transform functions

**Estimated time**: 2-3 hours

### Phase 3: Integration

1. Modify `EvalResult.createFromEvaluateResult()` to use `processForStorage()`
2. Modify `EvalResult.toEvaluateResult()` to use `resolveStorageReferences()`
3. Update all callers of `toEvaluateResult()` for async
4. Write integration tests

**Estimated time**: 3-4 hours

### Phase 4: Server & Cleanup

1. Create `src/server/routes/storage.ts` - serving endpoint
2. Register route in server
3. Modify eval deletion to clean up MinIO objects
4. Test end-to-end

**Estimated time**: 2 hours

### Phase 5: Documentation & Polish

1. Add environment variable documentation
2. Create Docker Compose example
3. Update any existing documentation
4. Manual testing

**Estimated time**: 1-2 hours

### Total Estimated Time: 11-15 hours

---

## 15. Open Questions

### 15.1 Threshold Value

**Question**: What should the default threshold be?

| Option | Pros                           | Cons                      |
| ------ | ------------------------------ | ------------------------- |
| 10KB   | More data in MinIO, smaller DB | Many small files in MinIO |
| 50KB   | Good balance                   | -                         |
| 100KB  | Fewer MinIO objects            | Larger DB                 |

**Recommendation**: 50KB default, configurable via env var.

### 15.2 Presigned URLs vs Proxy

**Question**: Should we use MinIO presigned URLs for direct browser access?

| Approach             | Pros                          | Cons                       |
| -------------------- | ----------------------------- | -------------------------- |
| Proxy (current plan) | Simpler, no CORS issues       | Server bandwidth           |
| Presigned URLs       | Direct access, offload server | CORS setup, URL expiration |

**Recommendation**: Start with proxy, add presigned URL option later if needed.

### 15.3 Audio Data Format

**Question**: `response.audio.data` contains raw base64 (not data URL). How to handle?

**Answer**: Detect by path (`*.audio.data`) and assume `audio/mpeg` MIME type. Could be enhanced to detect actual format.

### 15.4 Deduplication

**Question**: Should we deduplicate identical files?

**Current approach**: Hash-based keys mean identical files get same key, so MinIO naturally deduplicates. However, we don't reference-count, so deletion might orphan objects.

**Recommendation**: Accept potential orphans for now; add cleanup job later if needed.

### 15.5 Database Schema Changes

**Question**: Do we need any schema changes?

**Answer**: No. The JSON columns can hold either format. The reference format is just a different string value.

---

## 16. Future Enhancements

### 16.1 Alternative Storage Backends

- **AWS S3**: MinIO client is S3-compatible, just change endpoint
- **Google Cloud Storage**: Would need new provider implementation
- **Azure Blob Storage**: Would need new provider implementation

### 16.2 CDN Integration

```typescript
// Future: CDN support
getServeUrl(reference: string): string {
  if (this.cdnBaseUrl) {
    return `${this.cdnBaseUrl}/${this.parseReference(reference).key}`;
  }
  return `/api/storage/${encodeURIComponent(reference)}`;
}
```

### 16.3 Presigned URLs

```typescript
// Future: Direct browser access
async getPresignedUrl(reference: string, expirySeconds: number = 3600): Promise<string> {
  const { bucket, key } = this.parseReference(reference);
  return this.client.presignedGetObject(bucket, key, expirySeconds);
}
```

### 16.4 Compression

```typescript
// Future: Compress before storing
async store(data: Buffer, metadata): Promise<string> {
  const compressed = await gzip(data);
  // Store with Content-Encoding: gzip header
  // ...
}
```

### 16.5 Lifecycle Policies

Configure MinIO to auto-delete old objects:

```bash
mc ilm rule add myminio/promptfoo --expire-days 90
```

### 16.6 Orphan Cleanup Job

```typescript
// Future: Clean up orphaned objects
async cleanupOrphans(): Promise<number> {
  // List all objects in MinIO
  // Query all evalIds still in database
  // Delete objects whose evalId is not in database
}
```

---

## Appendix A: MinIO CLI Cheatsheet

```bash
# Install mc (MinIO Client)
brew install minio/stable/mc

# Configure alias
mc alias set local http://localhost:9000 minioadmin minioadmin

# List buckets
mc ls local

# Create bucket
mc mb local/promptfoo

# List objects in bucket
mc ls local/promptfoo

# List objects for specific eval
mc ls local/promptfoo/eval-abc123/

# Delete all objects for an eval
mc rm --recursive local/promptfoo/eval-abc123/

# Get object info
mc stat local/promptfoo/eval-abc123/deadbeef.png

# Download object
mc cp local/promptfoo/eval-abc123/deadbeef.png ./downloaded.png
```

---

## Appendix B: Troubleshooting

### MinIO Connection Issues

```typescript
// Test connection
const client = new Client({ ... });
try {
  await client.bucketExists('test');
  console.log('MinIO connected');
} catch (error) {
  console.error('MinIO connection failed:', error);
}
```

### Reference Resolution Failures

```typescript
// Debug reference resolution
const reference = 'pf://promptfoo/eval-abc/file.png';
console.log('Is valid reference:', isStorageReference(reference));
console.log('Parsed:', parseReference(reference));
```

### Storage Not Using MinIO

Check environment variables:

```bash
echo $PROMPTFOO_STORAGE_BACKEND
echo $PROMPTFOO_MINIO_ENDPOINT
echo $PROMPTFOO_MINIO_ACCESS_KEY
# secretKey should not be echoed!
```
