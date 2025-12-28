import * as fs from 'fs';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScratchpad } from '../../../../src/redteam/commands/recon/scratchpad';

describe('createScratchpad', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should create temp directory and notes file', () => {
    const scratchpad = createScratchpad();
    try {
      expect(fs.existsSync(scratchpad.dir)).toBe(true);
      expect(fs.existsSync(scratchpad.path)).toBe(true);
      expect(scratchpad.path).toMatch(/notes\.md$/);
    } finally {
      scratchpad.cleanup();
    }
  });

  it('should initialize notes file with header', () => {
    const scratchpad = createScratchpad();
    try {
      const content = fs.readFileSync(scratchpad.path, 'utf-8');
      expect(content).toContain('# Recon Scratchpad');
      expect(content).toContain('Use this file to keep notes');
    } finally {
      scratchpad.cleanup();
    }
  });

  it('should cleanup temp directory', () => {
    const scratchpad = createScratchpad();
    const dir = scratchpad.dir;
    expect(fs.existsSync(dir)).toBe(true);

    scratchpad.cleanup();

    expect(fs.existsSync(dir)).toBe(false);
  });

  it('should handle cleanup being called multiple times', () => {
    const scratchpad = createScratchpad();
    scratchpad.cleanup();

    // Should not throw
    expect(() => scratchpad.cleanup()).not.toThrow();
  });
});
