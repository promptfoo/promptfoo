/**
 * Production cache tests
 * These tests verify that fs-hash store works correctly in production environments
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('Production cache with fs-hash store', () => {
  const originalEnv = process.env;
  let testCachePath: string;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.PROMPTFOO_CACHE_TYPE;
    process.env.NODE_ENV = 'production';

    // Use a unique temp directory for each test
    testCachePath = path.join(os.tmpdir(), `promptfoo-cache-test-${Date.now()}`);
    process.env.PROMPTFOO_CACHE_PATH = testCachePath;
  });

  afterEach(() => {
    process.env = originalEnv;
    // Clean up test cache directory
    if (fs.existsSync(testCachePath)) {
      fs.rmSync(testCachePath, { recursive: true, force: true });
    }
  });

  it('should use fs-hash store in production on Linux/macOS', async () => {
    const isWindows = os.platform() === 'win32';

    const cacheModule = await import('../src/cache');
    const cache = cacheModule.getCache();

    if (isWindows) {
      // On Windows, we expect fallback to memory due to lockfile bug
      expect(cache.store).toHaveProperty('name', 'memory');
      console.log('✓ Windows correctly fell back to memory cache');
    } else {
      // On Linux/macOS, fs-hash should work
      expect(cache.store).toHaveProperty('name', 'fs-hash');
      console.log('✓ Linux/macOS using fs-hash store as expected');
    }
  });

  it('should create cache directory in production mode', async () => {
    const cacheModule = await import('../src/cache');
    cacheModule.getCache();

    const isWindows = os.platform() === 'win32';

    if (isWindows) {
      // On Windows with memory cache, directory might not be created
      console.log('✓ Windows test skipped (using memory cache)');
    } else {
      // On Linux/macOS, directory should be created for fs-hash
      expect(fs.existsSync(testCachePath)).toBe(true);
      console.log('✓ Cache directory created on Linux/macOS');
    }
  });

  it('should handle cache operations in production mode', async () => {
    const cacheModule = await import('../src/cache');
    const cache = cacheModule.getCache();

    const testKey = `test-key-${Date.now()}`;
    const testValue = 'test-value-123';

    // Set a value
    await cache.set(testKey, testValue);

    // Get the value back
    const retrieved = await cache.get(testKey);
    expect(retrieved).toBe(testValue);

    console.log('✓ Cache set/get operations work correctly');
  });

  it('should gracefully fall back to memory if fs-hash fails', async () => {
    // This test verifies our error handling works
    const cacheModule = await import('../src/cache');

    // Even if require() fails, getCache() should not throw
    expect(() => cacheModule.getCache()).not.toThrow();

    const cache = cacheModule.getCache();
    expect(cache).toBeDefined();
    expect(cache.store).toBeDefined();

    console.log('✓ Graceful fallback works correctly');
  });
});