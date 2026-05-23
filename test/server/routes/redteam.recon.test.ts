import fs from 'fs';
import path from 'path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../src/server/server';

// Mock the config directory path
vi.mock('../../../src/util/config/manage', () => ({
  getConfigDirectoryPath: vi.fn(() => '/tmp/promptfoo-test'),
}));

describe('Redteam Recon Routes', () => {
  let app: ReturnType<typeof createApp>;
  const testDir = '/tmp/promptfoo-test';
  const pendingReconPath = path.join(testDir, 'pending-recon.json');
  const handoffToken = 'a'.repeat(43);

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();

    // Ensure test directory exists
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(pendingReconPath)) {
      fs.unlinkSync(pendingReconPath);
    }
  });

  describe('GET /api/redteam/recon/pending', () => {
    it('should return 404 when no pending recon file exists', async () => {
      // Ensure file doesn't exist
      if (fs.existsSync(pendingReconPath)) {
        fs.unlinkSync(pendingReconPath);
      }

      const response = await request(app).get('/api/redteam/recon/pending');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'No pending recon configuration' });
    });

    it('should return pending recon config when file exists', async () => {
      const pendingData = {
        handoffToken,
        config: {
          description: 'Test config',
          plugins: ['bola', 'bfla'],
          strategies: ['jailbreak'],
        },
        metadata: {
          source: 'recon-cli',
          timestamp: 1703692800000,
          codebaseDirectory: '/path/to/project',
          keyFilesAnalyzed: 150,
        },
        reconResult: {
          purpose: 'Healthcare app',
        },
      };

      fs.writeFileSync(pendingReconPath, JSON.stringify(pendingData));

      const response = await request(app)
        .get('/api/redteam/recon/pending')
        .query({ token: handoffToken });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        config: pendingData.config,
        metadata: pendingData.metadata,
        reconResult: pendingData.reconResult,
      });
      expect(response.body.handoffToken).toBeUndefined();
      expect(fs.existsSync(pendingReconPath)).toBe(false);
    });

    it('should consume a valid handoff so it cannot be replayed', async () => {
      fs.writeFileSync(
        pendingReconPath,
        JSON.stringify({
          handoffToken,
          config: {},
          metadata: { source: 'recon-cli', timestamp: Date.now() },
        }),
      );

      const firstResponse = await request(app)
        .get('/api/redteam/recon/pending')
        .query({ token: handoffToken });
      const replayResponse = await request(app)
        .get('/api/redteam/recon/pending')
        .query({ token: handoffToken });

      expect(firstResponse.status).toBe(200);
      expect(replayResponse.status).toBe(404);
    });

    it('should reject retrieval without the browser handoff token', async () => {
      fs.writeFileSync(
        pendingReconPath,
        JSON.stringify({
          handoffToken,
          config: {},
          metadata: { source: 'recon-cli', timestamp: Date.now() },
        }),
      );

      const response = await request(app).get('/api/redteam/recon/pending');

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'Access denied: invalid recon handoff token' });
    });

    it('should return 400 for invalid pending recon file format', async () => {
      // Write invalid data (missing required fields)
      const invalidData = {
        config: {},
        metadata: {
          // Missing 'source' field
          timestamp: 1703692800000,
        },
      };

      fs.writeFileSync(pendingReconPath, JSON.stringify(invalidData));

      const response = await request(app).get('/api/redteam/recon/pending');

      expect(response.status).toBe(400);
      // Error message now includes regeneration guidance
      expect(response.body.error).toContain('Invalid pending recon file format');
      expect(response.body.error).toContain('Run `promptfoo redteam recon` again');
      expect(response.body.details).toBeUndefined();
      // Corrupted file should be auto-deleted to prevent repeated failures
      expect(fs.existsSync(pendingReconPath)).toBe(false);
    });

    it('should return 400 for malformed JSON and auto-delete corrupted file', async () => {
      fs.writeFileSync(pendingReconPath, 'not valid json {{{');

      const response = await request(app).get('/api/redteam/recon/pending');

      // Malformed JSON now returns 400 (InvalidPendingReconError) instead of 500
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('malformed JSON');
      expect(response.body.error).toContain('Run `promptfoo redteam recon` again');
      // Corrupted file should be auto-deleted to prevent repeated failures
      expect(fs.existsSync(pendingReconPath)).toBe(false);
    });
  });

  describe('DELETE /api/redteam/recon/pending', () => {
    it('should delete pending recon file when it exists', async () => {
      const pendingData = {
        handoffToken,
        config: {},
        metadata: {
          source: 'recon-cli',
          timestamp: Date.now(),
        },
      };

      fs.writeFileSync(pendingReconPath, JSON.stringify(pendingData));
      expect(fs.existsSync(pendingReconPath)).toBe(true);

      const response = await request(app)
        .delete('/api/redteam/recon/pending')
        .query({ token: handoffToken });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
      expect(fs.existsSync(pendingReconPath)).toBe(false);
    });

    it('should return success even when file does not exist', async () => {
      // Ensure file doesn't exist
      if (fs.existsSync(pendingReconPath)) {
        fs.unlinkSync(pendingReconPath);
      }

      const response = await request(app).delete('/api/redteam/recon/pending');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
    });

    it('should not delete pending recon data without the handoff token', async () => {
      fs.writeFileSync(
        pendingReconPath,
        JSON.stringify({
          handoffToken,
          config: {},
          metadata: { source: 'recon-cli', timestamp: Date.now() },
        }),
      );

      const response = await request(app).delete('/api/redteam/recon/pending');

      expect(response.status).toBe(403);
      expect(fs.existsSync(pendingReconPath)).toBe(true);
    });
  });
});
