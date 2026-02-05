import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../src/server/server';
import { asMockChildProcess, createMockChildProcess } from '../../util/mockChildProcess';

// Mock dependencies
vi.mock('child_process');
vi.mock('../../../src/commands/modelScan', () => ({
  checkModelAuditInstalled: vi.fn(),
}));

// Import after mocking
import { checkModelAuditInstalled } from '../../../src/commands/modelScan';

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
      expect(response.body).toHaveProperty('error', 'No paths provided');
    });

    it('should return 400 when paths is empty array', async () => {
      const response = await request(app).post('/api/model-audit/scan').send({ paths: [] });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'No paths provided');
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
    });

    it('should return not installed status when modelaudit is unavailable', async () => {
      mockedCheckModelAuditInstalled.mockResolvedValue({ installed: false, version: null });

      const response = await request(app).get('/api/model-audit/check-installed');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('installed', false);
      expect(response.body).toHaveProperty('version', null);
    });
  });
});
