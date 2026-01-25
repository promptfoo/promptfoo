import { describe, expect, it } from 'vitest';
import { createHonoApp } from '../../../src/server/hono/app';

/**
 * Integration tests for the Hono app.
 * These tests verify that routes are properly wired up and respond correctly.
 * Note: Database-dependent endpoints may fail without migrations, which is expected.
 */
describe('Hono App Integration', () => {
  it('should create app with all required properties', () => {
    const { app, staticDir } = createHonoApp();
    expect(app).toBeDefined();
    expect(staticDir).toBeDefined();
  });

  describe('Health Endpoints', () => {
    it('GET /health should return 200 with status', async () => {
      const { app } = createHonoApp();
      const req = new Request('http://localhost/health');
      const res = await app.fetch(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('status', 'OK');
      expect(data).toHaveProperty('version');
    });

    it('GET /api/remote-health should return 200', async () => {
      const { app } = createHonoApp();
      const req = new Request('http://localhost/api/remote-health');
      const res = await app.fetch(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('status', 'OK');
    });
  });

  describe('Version Endpoint', () => {
    it('GET /api/version should return version info', async () => {
      const { app } = createHonoApp();
      const req = new Request('http://localhost/api/version');
      const res = await app.fetch(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('currentVersion');
    });
  });

  describe('Providers Endpoints', () => {
    it('GET /api/providers should return providers list', async () => {
      const { app } = createHonoApp();
      const req = new Request('http://localhost/api/providers');
      const res = await app.fetch(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('data');
    });

    it('GET /api/providers/config-status should return config status', async () => {
      const { app } = createHonoApp();
      const req = new Request('http://localhost/api/providers/config-status');
      const res = await app.fetch(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('success', true);
    });
  });

  // Database-dependent endpoints - these may fail without migrations
  // We test that the routes exist and respond (even with errors) to verify wiring
  describe('Database-dependent Endpoints (may fail without DB)', () => {
    it('GET /api/results route exists and responds', async () => {
      const { app } = createHonoApp();
      const req = new Request('http://localhost/api/results');
      const res = await app.fetch(req);
      // May return 200 (if DB exists) or 500 (if no DB)
      expect([200, 500]).toContain(res.status);
    });

    it('GET /api/prompts route exists and responds', async () => {
      const { app } = createHonoApp();
      const req = new Request('http://localhost/api/prompts');
      const res = await app.fetch(req);
      expect([200, 500]).toContain(res.status);
    });

    it('GET /api/datasets route exists and responds', async () => {
      const { app } = createHonoApp();
      const req = new Request('http://localhost/api/datasets');
      const res = await app.fetch(req);
      expect([200, 500]).toContain(res.status);
    });

    it('GET /api/configs route exists and responds', async () => {
      const { app } = createHonoApp();
      const req = new Request('http://localhost/api/configs');
      const res = await app.fetch(req);
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('User Endpoints', () => {
    it('GET /api/user route exists and responds', async () => {
      const { app } = createHonoApp();
      const req = new Request('http://localhost/api/user');
      const res = await app.fetch(req);
      // User endpoint may return different status codes based on auth state
      expect([200, 401, 404]).toContain(res.status);
    });
  });

  describe('Telemetry Endpoint', () => {
    it('POST /api/telemetry should accept telemetry data', async () => {
      const { app } = createHonoApp();
      const req = new Request('http://localhost/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'test_event',
          properties: { test: true },
        }),
      });
      const res = await app.fetch(req);
      // Telemetry may return 200 on success or 400 if validation fails
      expect([200, 400]).toContain(res.status);
    });
  });

  describe('Route Registration', () => {
    it('should have blobs routes mounted', async () => {
      const { app } = createHonoApp();
      // blobs has GET /:hash endpoint
      const req = new Request('http://localhost/api/blobs/test-hash');
      const res = await app.fetch(req);
      // Should not be 404 (route exists) - may be 500 due to missing data
      expect(res.status).not.toBe(404);
    });

    it('should have media routes mounted', async () => {
      const { app } = createHonoApp();
      // media has GET /stats endpoint
      const req = new Request('http://localhost/api/media/stats');
      const res = await app.fetch(req);
      expect(res.status).not.toBe(404);
    });

    it('should have traces routes mounted', async () => {
      const { app } = createHonoApp();
      // traces has GET /evaluation/:evaluationId
      const req = new Request('http://localhost/api/traces/evaluation/test-id');
      const res = await app.fetch(req);
      // Route exists - may return 500 due to missing DB
      expect(res.status).not.toBe(404);
    });

    it('should have eval routes mounted', async () => {
      const { app } = createHonoApp();
      // Try to create a job (will fail without proper body but route should exist)
      const req = new Request('http://localhost/api/eval/job', { method: 'POST' });
      const res = await app.fetch(req);
      expect(res.status).not.toBe(404);
    });

    it('should have redteam routes mounted', async () => {
      const { app } = createHonoApp();
      const req = new Request('http://localhost/api/redteam/status');
      const res = await app.fetch(req);
      expect(res.status).not.toBe(404);
    });

    it('should have model-audit routes mounted', async () => {
      const { app } = createHonoApp();
      const req = new Request('http://localhost/api/model-audit/check-installed');
      const res = await app.fetch(req);
      expect(res.status).not.toBe(404);
    });
  });
});
