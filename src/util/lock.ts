/**
 * Simple file-based locking mechanism for concurrent write protection
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import logger from '../logger';

export interface LockOptions {
  retries?: number;
  retryDelay?: number;
  staleTimeout?: number;
}

export class FileLock {
  private lockDir: string;
  private lockId: string;
  private staleTimeout: number;

  constructor(baseDir: string, staleTimeout: number = 30000) {
    this.lockDir = path.join(baseDir, '.locks');
    this.lockId = randomUUID();
    this.staleTimeout = staleTimeout;
  }

  async acquire(
    key: string,
    options: LockOptions = {}
  ): Promise<() => Promise<void>> {
    const { retries = 10, retryDelay = 100 } = options;
    const lockPath = path.join(this.lockDir, `${key}.lock`);

    // Ensure lock directory exists
    await fs.mkdir(this.lockDir, { recursive: true });

    for (let i = 0; i < retries; i++) {
      try {
        // Try to create lock file exclusively
        const lockData = {
          id: this.lockId,
          pid: process.pid,
          timestamp: Date.now(),
        };
        
        await fs.writeFile(lockPath, JSON.stringify(lockData), { flag: 'wx' });
        
        // Return unlock function
        return async () => {
          try {
            // Verify we own the lock before removing
            const currentData = await fs.readFile(lockPath, 'utf-8');
            const current = JSON.parse(currentData);
            if (current.id === this.lockId) {
              await fs.unlink(lockPath);
            }
          } catch (error) {
            // Lock already removed or invalid
            logger.debug(`Lock already released: ${key}`);
          }
        };
      } catch (error: any) {
        if (error.code === 'EEXIST') {
          // Lock exists, check if it's stale
          try {
            const lockData = await fs.readFile(lockPath, 'utf-8');
            const lock = JSON.parse(lockData);
            const age = Date.now() - lock.timestamp;
            
            if (age > this.staleTimeout) {
              // Lock is stale, try to remove it
              logger.warn(`Removing stale lock for ${key} (age: ${age}ms)`);
              await fs.unlink(lockPath);
              continue; // Retry acquiring
            }
          } catch {
            // Error reading lock file, it may have been removed
          }
          
          // Lock is held by another process, wait and retry
          if (i < retries - 1) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }
        }
        
        throw error;
      }
    }

    throw new Error(`Failed to acquire lock for ${key} after ${retries} attempts`);
  }

  async withLock<T>(
    key: string,
    fn: () => Promise<T>,
    options?: LockOptions
  ): Promise<T> {
    const unlock = await this.acquire(key, options);
    try {
      return await fn();
    } finally {
      await unlock();
    }
  }

  /**
   * Clean up stale locks
   */
  async cleanup(): Promise<void> {
    try {
      const files = await fs.readdir(this.lockDir);
      const now = Date.now();
      
      for (const file of files) {
        if (!file.endsWith('.lock')) continue;
        
        const lockPath = path.join(this.lockDir, file);
        try {
          const data = await fs.readFile(lockPath, 'utf-8');
          const lock = JSON.parse(data);
          const age = now - lock.timestamp;
          
          if (age > this.staleTimeout) {
            logger.info(`Cleaning up stale lock: ${file} (age: ${age}ms)`);
            await fs.unlink(lockPath);
          }
        } catch (error) {
          // Error reading lock file, remove it
          logger.warn(`Removing invalid lock file: ${file}`);
          await fs.unlink(lockPath).catch(() => {});
        }
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        logger.error('Error cleaning up locks:', error);
      }
    }
  }
}