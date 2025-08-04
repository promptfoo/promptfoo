import * as fs from 'fs/promises';
import * as path from 'path';
import logger from '../logger';
import { FileLock } from '../util/lock';

export interface HashIndexEntry {
  hash: string;
  evalId: string;
  resultId: string;
  assetId: string;
  size: number;
  type: string;
  mimeType: string;
}

export class AssetDeduplicator {
  private indexPath: string;
  private index: Map<string, HashIndexEntry> = new Map();
  private allEntries: HashIndexEntry[] = [];  // Track all entries for stats
  private isDirty = false;
  private lock: FileLock;

  constructor(baseDir: string) {
    this.indexPath = path.join(baseDir, '.dedupe-index.json');
    this.lock = new FileLock(baseDir);
  }

  async initialize(): Promise<void> {
    // Use lock to prevent reading while another process is writing
    await this.lock.withLock('dedup-index', async () => {
      try {
        const data = await fs.readFile(this.indexPath, 'utf-8');
        const entries: HashIndexEntry[] = JSON.parse(data);
        this.index.clear();
        this.allEntries = entries;
        
        // Build index of first occurrence of each hash
        for (const entry of entries) {
          if (!this.index.has(entry.hash)) {
            this.index.set(entry.hash, entry);
          }
        }
        logger.debug(`Loaded deduplication index with ${this.allEntries.length} entries, ${this.index.size} unique`);
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          logger.warn('Failed to load deduplication index:', error);
        }
        // Start with empty index
        this.index.clear();
        this.allEntries = [];
      }
    });
  }

  async findExisting(hash: string): Promise<HashIndexEntry | undefined> {
    return this.index.get(hash);
  }

  async addEntry(entry: HashIndexEntry): Promise<void> {
    // Add to index if first occurrence
    if (!this.index.has(entry.hash)) {
      this.index.set(entry.hash, entry);
    }
    // Always add to all entries for stats
    this.allEntries.push(entry);
    this.isDirty = true;
  }

  async removeEntry(hash: string): Promise<void> {
    if (this.index.delete(hash)) {
      this.isDirty = true;
    }
  }

  async save(): Promise<void> {
    if (!this.isDirty) {
      return;
    }

    // Use lock to prevent concurrent saves
    await this.lock.withLock('dedup-index', async () => {
      // Double-check isDirty in case another process saved while we were waiting
      if (!this.isDirty) {
        return;
      }

      const tempPath = `${this.indexPath}.tmp`;
      
      try {
        // Ensure directory exists
        await fs.mkdir(path.dirname(this.indexPath), { recursive: true });
        await fs.writeFile(tempPath, JSON.stringify(this.allEntries, null, 2));
        await fs.rename(tempPath, this.indexPath);
        this.isDirty = false;
        logger.debug(`Saved deduplication index with ${this.allEntries.length} entries`);
      } catch (error) {
        logger.error('Failed to save deduplication index:', error);
        // Clean up temp file
        try {
          await fs.unlink(tempPath);
        } catch {}
        throw error;
      }
    });
  }

  async rebuild(baseDir: string): Promise<void> {
    logger.info('Rebuilding deduplication index...');
    this.index.clear();
    this.allEntries = [];
    
    try {
      await this.scanDirectory(baseDir);
      await this.save();
      logger.info(`Rebuilt deduplication index with ${this.allEntries.length} entries, ${this.index.size} unique`);
    } catch (error) {
      logger.error('Failed to rebuild deduplication index:', error);
      throw error;
    }
  }

  private async scanDirectory(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          // Skip hidden directories
          if (!entry.name.startsWith('.')) {
            await this.scanDirectory(fullPath);
          }
        } else if (entry.name.endsWith('.json') && !entry.name.includes('.tmp')) {
          // Found a metadata file
          try {
            const metadata = JSON.parse(await fs.readFile(fullPath, 'utf-8'));
            if (metadata.hash && metadata.id) {
              // Extract evalId and resultId from path
              const parts = path.relative(path.dirname(this.indexPath), path.dirname(fullPath)).split(path.sep);
              if (parts.length >= 2) {
                const [evalId, resultId] = parts;
                await this.addEntry({
                  hash: metadata.hash,
                  evalId,
                  resultId,
                  assetId: metadata.id,
                  size: metadata.size || 0,
                  type: metadata.type || 'unknown',
                  mimeType: metadata.mimeType || 'application/octet-stream',
                });
              }
            }
          } catch (error) {
            logger.warn(`Failed to process metadata file ${fullPath}:`, error);
          }
        }
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  getStats(): { totalAssets: number; uniqueAssets: number; duplicateBytes: number } {
    const hashCounts = new Map<string, { count: number; size: number }>();
    
    // Count all entries
    for (const entry of this.allEntries) {
      const existing = hashCounts.get(entry.hash);
      if (existing) {
        existing.count++;
      } else {
        hashCounts.set(entry.hash, { count: 1, size: entry.size });
      }
    }
    
    let duplicateBytes = 0;
    for (const { count, size } of hashCounts.values()) {
      if (count > 1) {
        duplicateBytes += (count - 1) * size;
      }
    }
    
    return {
      totalAssets: this.allEntries.length,
      uniqueAssets: hashCounts.size,
      duplicateBytes,
    };
  }
}