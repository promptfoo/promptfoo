import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../src/server/server';
import { asMockChildProcess, createMockChildProcess } from '../../util/mockChildProcess';

// Mock dependencies
vi.mock('child_process');
vi.mock('../../../src/commands/modelScan', () => ({
  checkModelAuditInstalled: vi.fn(),
}));

// Import after mocking
import { checkModelAuditInstalled } from '../../../src/commands/modelScan';
import { getDb } from '../../../src/database/index';
import { runDbMigrations } from '../../../src/migrate';
import ModelAudit from '../../../src/models/modelAudit';
import {
  CheckInstalledResponseSchema,
  CheckPathResponseSchema,
  DeleteScanResponseSchema,
  GetScanResponseSchema,
  ListScansResponseSchema,
} from '../../../src/types/api/modelAudit';

const mockedCheckModelAuditInstalled = vi.mocked(checkModelAuditInstalled);
const mockedSpawn = vi.mocked(spawn);

describe('Model Audit Routes', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock implementations to ensure test isolation when tests run in random order.
    // vi.clearAllMocks() only clears call history, not mockResolvedValue/mockReturnValue.
    mockedCheckModelAuditInstalled.mockReset();
    mockedSpawn.mockReset();
    app = createApp();
  });

  describe('POST /api/model-audit/scan', () => {
    it('should handle request without options object', async () => {
      // This tests the fix for: options = {} default when options is undefined
      mockedCheckModelAuditInstalled.mockResolvedValue({ installed: true, version: '0.2.20' });

      // Create a temporary test file
      const testFilePath = path.join(os.tmpdir(), 'test-model-audit-scan.pkl');
      fs.writeFileSync(testFilePath, 'test data');

      const mockScanOutput = JSON.stringify({
        total_checks: 5,
        passed_checks: 5,
        failed_checks: 0,
        files_scanned: 1,
        bytes_scanned: 9,
        has_errors: false,
        issues: [],
        checks: [],
      });

      // Use the test utility for cleaner mock creation
      const mockChildProcess = createMockChildProcess({
        exitCode: 0,
        stdoutData: mockScanOutput,
      });

      mockedSpawn.mockReturnValue(asMockChildProcess(mockChildProcess));

      // Request WITHOUT options - this would have caused "Cannot read properties of undefined" before the fix
      const response = await request(app)
        .post('/api/model-audit/scan')
        .send({ paths: [testFilePath] });

      // Clean up
      fs.unlinkSync(testFilePath);

      // Should succeed without TypeError
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('total_checks', 5);
      expect(response.body).toHaveProperty('has_errors', false);
    });

    it('should handle request with empty options object', async () => {
      mockedCheckModelAuditInstalled.mockResolvedValue({ installed: true, version: '0.2.20' });

      const testFilePath = path.join(os.tmpdir(), 'test-model-audit-scan-2.pkl');
      fs.writeFileSync(testFilePath, 'test data');

      const mockScanOutput = JSON.stringify({
        total_checks: 5,
        passed_checks: 5,
        failed_checks: 0,
        files_scanned: 1,
        bytes_scanned: 9,
        has_errors: false,
        issues: [],
        checks: [],
      });

      // Use the test utility for cleaner mock creation
      const mockChildProcess = createMockChildProcess({
        exitCode: 0,
        stdoutData: mockScanOutput,
      });

      mockedSpawn.mockReturnValue(asMockChildProcess(mockChildProcess));

      // Request with empty options object
      const response = await request(app)
        .post('/api/model-audit/scan')
        .send({ paths: [testFilePath], options: {} });

      fs.unlinkSync(testFilePath);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('total_checks', 5);
    });

    it('should return 400 when no paths provided', async () => {
      const response = await request(app).post('/api/model-audit/scan').send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 when paths is empty array', async () => {
      const response = await request(app).post('/api/model-audit/scan').send({ paths: [] });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 when paths is not an array', async () => {
      const response = await request(app)
        .post('/api/model-audit/scan')
        .send({ paths: 'not-an-array' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 when all paths are empty strings', async () => {
      const response = await request(app)
        .post('/api/model-audit/scan')
        .send({ paths: ['', '  '] });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 when modelaudit is not installed', async () => {
      mockedCheckModelAuditInstalled.mockResolvedValue({ installed: false, version: null });

      const testFilePath = path.join(os.tmpdir(), 'test-model-audit-not-installed.pkl');
      fs.writeFileSync(testFilePath, 'test data');

      const response = await request(app)
        .post('/api/model-audit/scan')
        .send({ paths: [testFilePath] });

      fs.unlinkSync(testFilePath);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('ModelAudit is not installed');
    });

    it('should return 400 when path does not exist', async () => {
      mockedCheckModelAuditInstalled.mockResolvedValue({ installed: true, version: '0.2.20' });

      const response = await request(app)
        .post('/api/model-audit/scan')
        .send({ paths: ['/nonexistent/path/to/model.pkl'] });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Path does not exist');
    });
  });

  describe('GET /api/model-audit/check-installed', () => {
    it('should return installed status when modelaudit is available', async () => {
      mockedCheckModelAuditInstalled.mockResolvedValue({ installed: true, version: '0.2.20' });

      const response = await request(app).get('/api/model-audit/check-installed');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('installed', true);
      expect(response.body).toHaveProperty('version', '0.2.20');
      expect(response.body).toHaveProperty('cwd');
      // Validate against schema
      expect(() => CheckInstalledResponseSchema.parse(response.body)).not.toThrow();
    });

    it('should return not installed status when modelaudit is unavailable', async () => {
      mockedCheckModelAuditInstalled.mockResolvedValue({ installed: false, version: null });

      const response = await request(app).get('/api/model-audit/check-installed');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('installed', false);
      expect(response.body).toHaveProperty('version', null);
      // Validate against schema
      expect(() => CheckInstalledResponseSchema.parse(response.body)).not.toThrow();
    });

    it('should handle checkModelAuditInstalled throwing', async () => {
      mockedCheckModelAuditInstalled.mockRejectedValue(new Error('pip not found'));

      const response = await request(app).get('/api/model-audit/check-installed');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('installed', false);
      expect(response.body).toHaveProperty('version', null);
      expect(() => CheckInstalledResponseSchema.parse(response.body)).not.toThrow();
    });
  });
});

describe('Model Audit Routes - DB-backed', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    mockedCheckModelAuditInstalled.mockReset();
    mockedSpawn.mockReset();
    app = createApp();
    // Clean up model_audits table
    const db = getDb();
    db.run('DELETE FROM model_audits');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  async function createTestAudit(overrides: Partial<Parameters<typeof ModelAudit.create>[0]> = {}) {
    return ModelAudit.create({
      name: 'Test Scan',
      modelPath: '/path/to/model.pkl',
      results: {
        total_checks: 5,
        passed_checks: 5,
        failed_checks: 0,
        has_errors: false,
        issues: [],
        checks: [],
      },
      ...overrides,
    });
  }

  describe('POST /api/model-audit/check-path', () => {
    it('should return 400 when path is missing', async () => {
      const response = await request(app).post('/api/model-audit/check-path').send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 when path is empty string', async () => {
      const response = await request(app).post('/api/model-audit/check-path').send({ path: '' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 when path is whitespace only', async () => {
      const response = await request(app).post('/api/model-audit/check-path').send({ path: '   ' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return exists: false for non-existent path', async () => {
      const response = await request(app)
        .post('/api/model-audit/check-path')
        .send({ path: '/nonexistent/path/abc123' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ exists: false, type: null });
      expect(() => CheckPathResponseSchema.parse(response.body)).not.toThrow();
    });

    it('should return directory info for existing directory', async () => {
      const response = await request(app)
        .post('/api/model-audit/check-path')
        .send({ path: os.tmpdir() });

      expect(response.status).toBe(200);
      expect(response.body.exists).toBe(true);
      expect(response.body.type).toBe('directory');
      expect(response.body.absolutePath).toBeTruthy();
      expect(response.body.name).toBeTruthy();
      expect(() => CheckPathResponseSchema.parse(response.body)).not.toThrow();
    });

    it('should return file info for existing file', async () => {
      const testFile = path.join(os.tmpdir(), 'test-check-path.txt');
      fs.writeFileSync(testFile, 'test');

      const response = await request(app)
        .post('/api/model-audit/check-path')
        .send({ path: testFile });

      fs.unlinkSync(testFile);

      expect(response.status).toBe(200);
      expect(response.body.exists).toBe(true);
      expect(response.body.type).toBe('file');
      expect(response.body.name).toBe('test-check-path.txt');
      expect(() => CheckPathResponseSchema.parse(response.body)).not.toThrow();
    });

    it('should expand ~ in paths', async () => {
      const response = await request(app).post('/api/model-audit/check-path').send({ path: '~/' });

      expect(response.status).toBe(200);
      // Home directory should exist
      expect(response.body.exists).toBe(true);
      expect(response.body.type).toBe('directory');
    });
  });

  describe('GET /api/model-audit/scans', () => {
    it('should return empty list when no scans exist', async () => {
      const response = await request(app).get('/api/model-audit/scans');

      expect(response.status).toBe(200);
      expect(response.body.scans).toEqual([]);
      expect(response.body.total).toBe(0);
      expect(response.body.limit).toBe(100);
      expect(response.body.offset).toBe(0);
      expect(() => ListScansResponseSchema.parse(response.body)).not.toThrow();
    });

    it('should return scans with default pagination', async () => {
      await createTestAudit({ name: 'Scan A' });
      await createTestAudit({ name: 'Scan B' });

      const response = await request(app).get('/api/model-audit/scans');

      expect(response.status).toBe(200);
      expect(response.body.scans).toHaveLength(2);
      expect(response.body.total).toBe(2);
      expect(() => ListScansResponseSchema.parse(response.body)).not.toThrow();
    });

    it('should respect limit and offset', async () => {
      await createTestAudit({ name: 'Scan 1' });
      await createTestAudit({ name: 'Scan 2' });
      await createTestAudit({ name: 'Scan 3' });

      const response = await request(app).get('/api/model-audit/scans?limit=2&offset=1');

      expect(response.status).toBe(200);
      expect(response.body.scans).toHaveLength(2);
      expect(response.body.total).toBe(3);
      expect(response.body.limit).toBe(2);
      expect(response.body.offset).toBe(1);
    });

    it('should filter by search term', async () => {
      await createTestAudit({ name: 'Alpha Model', modelPath: '/path/alpha.pkl' });
      await createTestAudit({ name: 'Beta Model', modelPath: '/path/beta.pkl' });

      const response = await request(app).get('/api/model-audit/scans?search=Alpha');

      expect(response.status).toBe(200);
      expect(response.body.scans).toHaveLength(1);
      expect(response.body.scans[0].name).toBe('Alpha Model');
      expect(response.body.total).toBe(1);
    });

    it('should sort by name ascending', async () => {
      await createTestAudit({ name: 'Zebra' });
      await createTestAudit({ name: 'Apple' });

      const response = await request(app).get('/api/model-audit/scans?sort=name&order=asc');

      expect(response.status).toBe(200);
      expect(response.body.scans[0].name).toBe('Apple');
      expect(response.body.scans[1].name).toBe('Zebra');
    });

    it('should return 400 for invalid sort field', async () => {
      const response = await request(app).get('/api/model-audit/scans?sort=hackerField');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 for invalid sort order', async () => {
      const response = await request(app).get('/api/model-audit/scans?order=sideways');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 for limit exceeding max', async () => {
      const response = await request(app).get('/api/model-audit/scans?limit=999');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 for negative offset', async () => {
      const response = await request(app).get('/api/model-audit/scans?offset=-1');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 for limit of 0', async () => {
      const response = await request(app).get('/api/model-audit/scans?limit=0');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 for non-numeric limit', async () => {
      const response = await request(app).get('/api/model-audit/scans?limit=abc');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/model-audit/scans/latest', () => {
    it('should return 404 when no scans exist', async () => {
      const response = await request(app).get('/api/model-audit/scans/latest');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'No scans found');
    });

    it('should return the latest scan', async () => {
      await createTestAudit({ name: 'Older Scan' });
      // Small delay to ensure different timestamps
      const latest = await createTestAudit({ name: 'Newer Scan' });

      const response = await request(app).get('/api/model-audit/scans/latest');

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(latest.id);
      expect(response.body.name).toBe('Newer Scan');
      expect(() => GetScanResponseSchema.parse(response.body)).not.toThrow();
    });
  });

  describe('GET /api/model-audit/scans/:id', () => {
    it('should return a scan by ID', async () => {
      const audit = await createTestAudit({ name: 'My Scan' });

      const response = await request(app).get(`/api/model-audit/scans/${audit.id}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(audit.id);
      expect(response.body.name).toBe('My Scan');
      expect(response.body.modelPath).toBe('/path/to/model.pkl');
      expect(response.body.hasErrors).toBe(false);
      expect(() => GetScanResponseSchema.parse(response.body)).not.toThrow();
    });

    it('should return 404 for non-existent scan', async () => {
      const response = await request(app).get('/api/model-audit/scans/nonexistent-id-123');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Model scan not found');
    });
  });

  describe('DELETE /api/model-audit/scans/:id', () => {
    it('should delete a scan by ID', async () => {
      const audit = await createTestAudit({ name: 'To Delete' });

      const response = await request(app).delete(`/api/model-audit/scans/${audit.id}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Model scan deleted successfully');
      expect(() => DeleteScanResponseSchema.parse(response.body)).not.toThrow();

      // Verify it's actually deleted
      const getResponse = await request(app).get(`/api/model-audit/scans/${audit.id}`);
      expect(getResponse.status).toBe(404);
    });

    it('should return 404 when deleting non-existent scan', async () => {
      const response = await request(app).delete('/api/model-audit/scans/nonexistent-id-456');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Model scan not found');
    });
  });
});
