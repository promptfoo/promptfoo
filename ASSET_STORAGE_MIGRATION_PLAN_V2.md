# Asset Storage Migration Plan v2 - Pragmatic Approach

## Executive Summary

This revised plan addresses storing large assets (images, audio) outside SQLite with a focus on simplicity, incremental delivery, and operational excellence. We start with a minimal solution and evolve based on real usage data.

## Core Principles

1. **Start Simple** - Minimal viable solution first
2. **Don't Touch Existing Data** - New assets only, no risky migrations
3. **Measure Everything** - Data-driven decisions
4. **Fail Gracefully** - Always have a fallback
5. **User Value First** - Every change must improve user experience

## Problem Statement

### Current Issues (Validated)
- Large base64 images in SQLite JSON columns (up to 10MB per image)
- Slow evaluation result queries when results contain images
- Memory spikes when loading multiple image results
- Database backups are unnecessarily large

### Non-Problems (Assumptions to Validate)
- Asset deduplication (need data on actual duplication rates)
- Complex access patterns (most assets accessed once?)
- Scale issues (current volume unknown)

## Phase 1: Minimal Viable Solution (Week 1)

### Goal
Store new image/audio assets as files, keep everything else unchanged.

### Implementation

#### 1.1 Simple Asset Storage

```typescript
// src/assets/index.ts
export interface AssetMetadata {
  id: string;
  type: 'image' | 'audio';
  mimeType: string;
  size: number;
  hash: string;
  createdAt: number;
}

export class AssetStore {
  private readonly baseDir: string;
  private readonly maxFileSize: number;
  
  constructor() {
    this.baseDir = path.join(getConfigDirectoryPath(), 'assets');
    this.maxFileSize = getEnvInt('PROMPTFOO_MAX_ASSET_SIZE', 50 * 1024 * 1024); // 50MB
  }
  
  async save(
    data: Buffer, 
    type: 'image' | 'audio',
    mimeType: string,
    evalId: string,
    resultId: string
  ): Promise<AssetMetadata> {
    // Validate size
    if (data.length > this.maxFileSize) {
      throw new Error(`Asset too large: ${data.length} bytes (max: ${this.maxFileSize})`);
    }
    
    // Simple directory structure: assets/{evalId}/{resultId}/
    const dir = path.join(this.baseDir, evalId, resultId);
    await fs.mkdir(dir, { recursive: true });
    
    // Generate metadata
    const id = randomUUID();
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    const metadata: AssetMetadata = {
      id,
      type,
      mimeType,
      size: data.length,
      hash,
      createdAt: Date.now()
    };
    
    // Save file and metadata atomically
    const filePath = path.join(dir, id);
    const metaPath = `${filePath}.json`;
    
    // Write to temp files first
    await fs.writeFile(`${filePath}.tmp`, data);
    await fs.writeFile(`${metaPath}.tmp`, JSON.stringify(metadata));
    
    // Atomic rename
    await fs.rename(`${filePath}.tmp`, filePath);
    await fs.rename(`${metaPath}.tmp`, metaPath);
    
    return metadata;
  }
  
  async load(evalId: string, resultId: string, assetId: string): Promise<Buffer> {
    const filePath = path.join(this.baseDir, evalId, resultId, assetId);
    
    // Security check
    if (!this.isPathSafe(filePath)) {
      throw new Error('Invalid asset path');
    }
    
    try {
      return await fs.readFile(filePath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error('Asset not found');
      }
      throw error;
    }
  }
  
  async getMetadata(evalId: string, resultId: string, assetId: string): Promise<AssetMetadata> {
    const metaPath = path.join(this.baseDir, evalId, resultId, `${assetId}.json`);
    
    if (!this.isPathSafe(metaPath)) {
      throw new Error('Invalid asset path');
    }
    
    const data = await fs.readFile(metaPath, 'utf-8');
    return JSON.parse(data);
  }
  
  private isPathSafe(requestedPath: string): boolean {
    const resolved = path.resolve(requestedPath);
    const baseResolved = path.resolve(this.baseDir);
    return resolved.startsWith(baseResolved);
  }
}

// Global instance with lazy initialization
let assetStore: AssetStore | null = null;

export function getAssetStore(): AssetStore {
  if (!assetStore) {
    assetStore = new AssetStore();
  }
  return assetStore;
}
```

#### 1.2 Provider Integration (OpenAI Example)

```typescript
// src/providers/openai/image.ts - Modified section only
export async function processApiResponse(
  data: any,
  prompt: string,
  responseFormat: string,
  cached: boolean,
  model: string,
  size: string,
  quality?: string,
  n: number = 1,
  context?: CallApiContextParams,
): Promise<ProviderResponse> {
  if (data.error) {
    return { error: formatOpenAiError(data) };
  }

  try {
    // Handle base64 response with asset storage
    if (responseFormat === 'b64_json' && context?.evalId && context?.resultId) {
      const b64Data = data.data[0].b64_json;
      
      // Check if asset storage is enabled
      const useAssetStorage = getEnvBool('PROMPTFOO_USE_ASSET_STORAGE', false);
      
      if (useAssetStorage) {
        try {
          // Save to asset store
          const assetStore = getAssetStore();
          const imageBuffer = Buffer.from(b64Data, 'base64');
          
          const metadata = await assetStore.save(
            imageBuffer,
            'image',
            'image/png',
            context.evalId,
            context.resultId
          );
          
          // Return reference instead of base64
          return {
            output: `![${ellipsize(prompt, 50)}](asset://${context.evalId}/${context.resultId}/${metadata.id})`,
            cached,
            cost: cached ? 0 : calculateImageCost(model, size, quality, n),
            metadata: {
              asset: metadata
            }
          };
        } catch (error) {
          // Log error but fall back to base64
          logger.error('Failed to save asset, falling back to base64:', error);
          // Continue with normal base64 response below
        }
      }
    }
    
    // Original base64 handling (fallback)
    const formattedOutput = formatOutput(data, prompt, responseFormat);
    if (typeof formattedOutput === 'object') {
      return formattedOutput;
    }

    const cost = cached ? 0 : calculateImageCost(model, size, quality, n);
    return {
      output: formattedOutput,
      cached,
      cost,
      ...(responseFormat === 'b64_json' ? { isBase64: true } : {}),
    };
  } catch (err) {
    return {
      error: `API error: ${String(err)}: ${JSON.stringify(data)}`,
    };
  }
}
```

#### 1.3 API Endpoint

```typescript
// src/server/routes/assets.ts
export function setupAssetRoutes(app: Express) {
  const assetStore = getAssetStore();
  
  // Simple asset serving with security
  app.get('/api/eval/:evalId/result/:resultId/asset/:assetId', async (req, res) => {
    const { evalId, resultId, assetId } = req.params;
    
    // Validate UUIDs
    if (!isValidUUID(evalId) || !isValidUUID(resultId) || !isValidUUID(assetId)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }
    
    try {
      // Get metadata first
      const metadata = await assetStore.getMetadata(evalId, resultId, assetId);
      
      // Set appropriate headers
      res.set({
        'Content-Type': metadata.mimeType,
        'Content-Length': metadata.size.toString(),
        'Cache-Control': 'private, max-age=3600', // 1 hour cache
        'X-Asset-Hash': metadata.hash
      });
      
      // Stream the file
      const filePath = path.join(
        getConfigDirectoryPath(), 
        'assets', 
        evalId, 
        resultId, 
        assetId
      );
      
      res.sendFile(filePath, (err) => {
        if (err) {
          logger.error('Error serving asset:', err);
          if (!res.headersSent) {
            res.status(404).json({ error: 'Asset not found' });
          }
        }
      });
    } catch (error) {
      logger.error('Asset serving error:', error);
      res.status(404).json({ error: 'Asset not found' });
    }
  });
}
```

#### 1.4 Frontend Updates

```typescript
// src/app/src/components/ResultDisplay.tsx
function renderOutput(output: string | any): React.ReactNode {
  if (typeof output === 'string') {
    // Check for asset references
    const assetMatch = output.match(/!\[([^\]]*)\]\(asset:\/\/([^/]+)\/([^/]+)\/([^)]+)\)/);
    
    if (assetMatch) {
      const [, alt, evalId, resultId, assetId] = assetMatch;
      return (
        <img 
          src={`/api/eval/${evalId}/result/${resultId}/asset/${assetId}`}
          alt={alt}
          loading="lazy"
          onError={(e) => {
            // Fallback to text on error
            e.currentTarget.style.display = 'none';
            e.currentTarget.insertAdjacentText('afterend', output);
          }}
        />
      );
    }
    
    // Handle legacy base64 images
    if (output.includes('data:image')) {
      return <img src={output} alt="Generated image" />;
    }
  }
  
  // ... rest of rendering logic
}
```

### Monitoring & Metrics

```typescript
// src/assets/metrics.ts
export class AssetMetrics {
  private static instance: AssetMetrics;
  private metrics = {
    saveAttempts: 0,
    saveSuccesses: 0,
    saveFailures: 0,
    loadAttempts: 0,
    loadSuccesses: 0,
    loadFailures: 0,
    totalBytesStored: 0,
    largestAsset: 0,
  };
  
  static getInstance(): AssetMetrics {
    if (!this.instance) {
      this.instance = new AssetMetrics();
    }
    return this.instance;
  }
  
  recordSave(success: boolean, size?: number) {
    this.metrics.saveAttempts++;
    if (success && size) {
      this.metrics.saveSuccesses++;
      this.metrics.totalBytesStored += size;
      this.metrics.largestAsset = Math.max(this.metrics.largestAsset, size);
    } else {
      this.metrics.saveFailures++;
    }
  }
  
  recordLoad(success: boolean) {
    this.metrics.loadAttempts++;
    if (success) {
      this.metrics.loadSuccesses++;
    } else {
      this.metrics.loadFailures++;
    }
  }
  
  getMetrics() {
    return {
      ...this.metrics,
      saveSuccessRate: this.metrics.saveAttempts > 0 
        ? this.metrics.saveSuccesses / this.metrics.saveAttempts 
        : 0,
      loadSuccessRate: this.metrics.loadAttempts > 0
        ? this.metrics.loadSuccesses / this.metrics.loadAttempts
        : 0,
      averageAssetSize: this.metrics.saveSuccesses > 0
        ? this.metrics.totalBytesStored / this.metrics.saveSuccesses
        : 0
    };
  }
}

// Add to asset store methods
async save(...args) {
  const metrics = AssetMetrics.getInstance();
  try {
    const result = await this._save(...args);
    metrics.recordSave(true, result.size);
    return result;
  } catch (error) {
    metrics.recordSave(false);
    throw error;
  }
}
```

### Disk Space Monitoring

```typescript
// src/assets/monitor.ts
import diskusage from 'diskusage';

export class AssetMonitor {
  private checkInterval: NodeJS.Timer | null = null;
  
  start() {
    // Check disk space every 5 minutes
    this.checkInterval = setInterval(() => {
      this.checkDiskSpace();
    }, 5 * 60 * 1000);
    
    // Initial check
    this.checkDiskSpace();
  }
  
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }
  
  private async checkDiskSpace() {
    try {
      const assetsPath = path.join(getConfigDirectoryPath(), 'assets');
      const disk = await diskusage.check(assetsPath);
      
      const freePercentage = (disk.free / disk.total) * 100;
      
      if (freePercentage < 10) {
        logger.error(`CRITICAL: Disk space low! Only ${freePercentage.toFixed(1)}% free`);
        // Could trigger alerts here
      } else if (freePercentage < 20) {
        logger.warn(`WARNING: Disk space getting low: ${freePercentage.toFixed(1)}% free`);
      }
      
      // Log metrics
      logger.debug('Disk usage:', {
        total: `${(disk.total / 1e9).toFixed(2)} GB`,
        free: `${(disk.free / 1e9).toFixed(2)} GB`,
        used: `${((disk.total - disk.free) / 1e9).toFixed(2)} GB`,
        freePercentage: `${freePercentage.toFixed(1)}%`
      });
    } catch (error) {
      logger.error('Failed to check disk space:', error);
    }
  }
}
```

## Phase 2: Production Hardening (Week 2)

### 2.1 Error Recovery

```typescript
// Enhanced asset store with retry logic
class ResilientAssetStore extends AssetStore {
  async save(
    data: Buffer,
    type: 'image' | 'audio',
    mimeType: string,
    evalId: string,
    resultId: string,
    retries: number = 3
  ): Promise<AssetMetadata> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await super.save(data, type, mimeType, evalId, resultId);
      } catch (error) {
        lastError = error as Error;
        logger.warn(`Asset save attempt ${attempt} failed:`, error);
        
        if (attempt < retries) {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)));
        }
      }
    }
    
    throw lastError || new Error('Asset save failed');
  }
}
```

### 2.2 Backup Strategy

```typescript
// Daily backup of asset metadata
export class AssetBackup {
  async backupMetadata(): Promise<void> {
    const assetsDir = path.join(getConfigDirectoryPath(), 'assets');
    const backupDir = path.join(getConfigDirectoryPath(), 'backups', 'assets');
    const timestamp = new Date().toISOString().split('T')[0];
    
    await fs.mkdir(backupDir, { recursive: true });
    
    // Collect all metadata files
    const metadataFiles: string[] = [];
    
    async function scanDir(dir: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          await scanDir(fullPath);
        } else if (entry.name.endsWith('.json')) {
          metadataFiles.push(fullPath);
        }
      }
    }
    
    await scanDir(assetsDir);
    
    // Create backup archive
    const backupFile = path.join(backupDir, `metadata-${timestamp}.json`);
    const backup = {
      timestamp: new Date().toISOString(),
      version: 1,
      assetCount: metadataFiles.length,
      metadata: [] as any[]
    };
    
    for (const file of metadataFiles) {
      const content = await fs.readFile(file, 'utf-8');
      const relativePath = path.relative(assetsDir, file);
      backup.metadata.push({
        path: relativePath,
        data: JSON.parse(content)
      });
    }
    
    await fs.writeFile(backupFile, JSON.stringify(backup, null, 2));
    logger.info(`Backed up ${metadataFiles.length} asset metadata files`);
  }
}
```

### 2.3 Health Checks

```typescript
// src/server/routes/health.ts
app.get('/api/health/assets', async (req, res) => {
  const checks = {
    storage: 'unknown',
    diskSpace: 'unknown',
    writeTest: 'unknown',
    metrics: null as any
  };
  
  try {
    // Check disk space
    const disk = await diskusage.check(path.join(getConfigDirectoryPath(), 'assets'));
    const freePercentage = (disk.free / disk.total) * 100;
    checks.diskSpace = freePercentage > 20 ? 'healthy' : 
                       freePercentage > 10 ? 'warning' : 'critical';
    
    // Test write capability
    const testId = `health-check-${Date.now()}`;
    const testData = Buffer.from('test');
    const assetStore = getAssetStore();
    
    try {
      await assetStore.save(testData, 'image', 'image/png', 'health', testId);
      // Clean up test file
      const testPath = path.join(getConfigDirectoryPath(), 'assets', 'health', testId);
      await fs.rm(testPath, { recursive: true, force: true });
      checks.writeTest = 'healthy';
    } catch (error) {
      checks.writeTest = 'failed';
    }
    
    // Get metrics
    checks.metrics = AssetMetrics.getInstance().getMetrics();
    
    // Overall status
    checks.storage = checks.diskSpace === 'healthy' && checks.writeTest === 'healthy' 
      ? 'healthy' : 'degraded';
    
    const statusCode = checks.storage === 'healthy' ? 200 : 503;
    res.status(statusCode).json(checks);
  } catch (error) {
    res.status(503).json({
      ...checks,
      storage: 'error',
      error: error.message
    });
  }
});
```

## Phase 3: Scale When Needed (Week 3+)

### 3.1 Simple Deduplication (Only if metrics show >20% duplication)

```typescript
// Add to AssetStore only if needed
async saveWithDedup(
  data: Buffer,
  type: 'image' | 'audio',
  mimeType: string,
  evalId: string,
  resultId: string
): Promise<AssetMetadata> {
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  
  // Check if we already have this asset
  const existing = await this.findByHash(hash);
  if (existing) {
    // Create a reference to existing asset
    const refPath = path.join(this.baseDir, evalId, resultId, `${existing.id}.ref`);
    await fs.mkdir(path.dirname(refPath), { recursive: true });
    await fs.writeFile(refPath, JSON.stringify({
      originalPath: existing.path,
      hash: hash
    }));
    
    return existing;
  }
  
  // New asset, save normally
  return this.save(data, type, mimeType, evalId, resultId);
}
```

### 3.2 S3 Support (Only when local storage becomes problematic)

```typescript
// src/assets/storage/s3.ts - Add only when needed
export class S3AssetStore implements AssetStoreInterface {
  private s3: S3Client;
  private bucket: string;
  
  async save(/* same signature */): Promise<AssetMetadata> {
    // S3 implementation
    // But only add this when you actually need it!
  }
}
```

## Migration Strategy

### No Migration! 
- Existing data stays in SQLite (it works!)
- Only new evaluations use asset storage
- Enable gradually with feature flag

### Feature Flags

```typescript
// Environment variables
PROMPTFOO_USE_ASSET_STORAGE=false  # Start disabled
PROMPTFOO_ASSET_STORAGE_PROVIDERS=openai:image,openai:audio  # Specific providers only
PROMPTFOO_MAX_ASSET_SIZE=52428800  # 50MB default
PROMPTFOO_ASSET_DISK_WARNING_THRESHOLD=20  # Warn at 20% free space
PROMPTFOO_ASSET_DISK_CRITICAL_THRESHOLD=10  # Critical at 10% free space
```

### Rollout Plan

1. **Week 1**: Deploy disabled to production
2. **Week 2**: Enable for internal testing (specific users)
3. **Week 3**: Enable for 10% of users
4. **Week 4**: Enable for 50% of users
5. **Week 5**: Enable for all users
6. **Week 6**: Remove feature flag

### Rollback Procedure

```bash
# Instant rollback - just disable the feature
export PROMPTFOO_USE_ASSET_STORAGE=false

# Assets remain accessible even when disabled
# Frontend gracefully handles both formats
```

## Success Metrics

### Primary Metrics (Must Improve)
1. **P95 evaluation result load time** - Target: <100ms (from current ~500ms with images)
2. **Memory usage during result viewing** - Target: 50% reduction
3. **User-reported performance issues** - Target: 90% reduction

### Secondary Metrics (Monitor)
1. **Disk usage growth rate** - Sustainable?
2. **Asset serve success rate** - Target: >99.9%
3. **Feature adoption rate** - Are users seeing benefits?

### Operational Metrics (Must Have)
1. **Disk space remaining** - Alert at <20%
2. **Asset save failures** - Alert at >1%
3. **Asset serve latency** - Alert at P95 >500ms

## What We're NOT Doing (Yet)

1. **No complex directory structures** - Simple is better
2. **No deduplication** - Until we prove it's needed
3. **No garbage collection** - Until disk space is an issue
4. **No CDN/S3** - Until local storage fails us
5. **No migration of existing data** - Too risky, little benefit

## Recovery Procedures

### Asset Loss Recovery
```typescript
// If an asset is lost, gracefully degrade
if (assetNotFound) {
  // 1. Log the error with full context
  logger.error('Asset not found', { evalId, resultId, assetId });
  
  // 2. Return placeholder
  return {
    output: '[Image not available]',
    error: 'Asset could not be loaded'
  };
}
```

### Disk Full Recovery
1. Alert ops team immediately
2. Move old assets to archive storage
3. Increase disk space
4. Implement retention policy

### Corruption Recovery
- Metadata in JSON files can be rebuilt from filenames
- Use file command to detect MIME types
- Size from filesystem
- Hash can be recalculated

## Development & Testing

### Local Development
```bash
# Enable asset storage locally
export PROMPTFOO_USE_ASSET_STORAGE=true
export PROMPTFOO_ASSET_STORAGE_PROVIDERS=openai:image

# Run with verbose logging
export DEBUG=promptfoo:assets:*
npm run dev
```

### Testing Strategy
```typescript
// Unit tests for AssetStore
describe('AssetStore', () => {
  it('saves and loads assets correctly', async () => {
    const store = new AssetStore();
    const data = Buffer.from('test image data');
    
    const metadata = await store.save(data, 'image', 'image/png', 'eval1', 'result1');
    const loaded = await store.load('eval1', 'result1', metadata.id);
    
    expect(loaded).toEqual(data);
  });
  
  it('prevents path traversal attacks', async () => {
    const store = new AssetStore();
    
    await expect(
      store.load('../../../etc', 'passwd', 'evil')
    ).rejects.toThrow('Invalid asset path');
  });
  
  it('handles disk full gracefully', async () => {
    // Mock fs to simulate ENOSPC error
    jest.spyOn(fs, 'writeFile').mockRejectedValue({ code: 'ENOSPC' });
    
    const store = new AssetStore();
    await expect(
      store.save(Buffer.from('data'), 'image', 'image/png', 'eval1', 'result1')
    ).rejects.toThrow();
  });
});
```

## Documentation

### User-Facing Docs
```markdown
# Asset Storage

Promptfoo now stores large images and audio files separately from the database 
for better performance.

## What's Changed?
- Faster loading of evaluation results with images
- Lower memory usage when viewing results
- No changes to your workflow

## Troubleshooting
- If images don't load, check your disk space
- Assets are stored in ~/.promptfoo/assets/
```

### Ops Runbook
```markdown
# Asset Storage Operations

## Monitoring
- Dashboard: /admin/assets
- Alerts configured in PagerDuty
- Logs: grep "asset" in application logs

## Common Issues

### Disk Space Low
1. Check current usage: `df -h ~/.promptfoo/assets`
2. Find large evaluations: `du -sh ~/.promptfoo/assets/*/* | sort -h`
3. Archive old evaluations if needed

### Asset Not Loading
1. Check if file exists: `ls ~/.promptfoo/assets/{evalId}/{resultId}/{assetId}`
2. Check permissions: `ls -la ~/.promptfoo/assets/`
3. Check application logs for errors

### Performance Degradation
1. Check disk I/O: `iostat -x 1`
2. Check file count: `find ~/.promptfoo/assets -type f | wc -l`
3. Consider enabling deduplication if >100k files
```

## Summary

This revised plan:
1. **Starts simple** - Basic file storage, no complexity
2. **Measures everything** - Data-driven optimization
3. **Fails gracefully** - Always has fallbacks
4. **Scales incrementally** - Add features when needed
5. **Minimizes risk** - No data migration, gradual rollout

Total implementation: 1-2 weeks for MVP, not 6 weeks.