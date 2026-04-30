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
import { modelAuditsTable } from '../../../src/database/tables';
import { runDbMigrations } from '../../../src/migrate';
import ModelAudit from '../../../src/models/modelAudit';
import {
  CheckInstalledResponseSchema,
  CheckPathResponseSchema,
  DeleteScanResponseSchema,
  GetScanResponseSchema,
  ListScannersResponseSchema,
  ListScansResponseSchema,
  ModelAuditSchemas,
} from '../../../src/types/api/modelAudit';

const mockedCheckModelAuditInstalled = vi.mocked(checkModelAuditInstalled);
const mockedSpawn = vi.mocked(spawn);

describe('Model Audit Routes', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
    // Reset mock implementations to ensure test isolation when tests run in random order.
    // vi.clearAllMocks() only clears call history, not mockResolvedValue/mockReturnValue.
    mockedCheckModelAuditInstalled.mockReset();
    mockedSpawn.mockReset();
  });

  describe('GET /api/model-audit/scanners', () => {
    it('should return the scanner catalog', async () => {
      mockedCheckModelAuditInstalled.mockResolvedValue({ installed: true, version: '0.2.30' });
      const scannerOutput = JSON.stringify({
        scanners: [
          {
            id: 'pickle',
            class: 'PickleScanner',
            description: 'Scans pickle files',
            extensions: ['.pkl'],
            dependencies: [],
          },
        ],
      });

      mockedSpawn.mockReturnValue(
        asMockChildProcess(
          createMockChildProcess({
            exitCode: 0,
            stdoutData: scannerOutput,
          }),
        ),
      );

      const response = await request(app).get('/api/model-audit/scanners');

      expect(response.status).toBe(200);
      expect(response.body.scanners).toHaveLength(1);
      expect(response.body.scanners[0].id).toBe('pickle');
      expect(() => ListScannersResponseSchema.parse(response.body)).not.toThrow();
      expect(mockedSpawn).toHaveBeenCalledWith(
        'modelaudit',
        ['scan', '--format', 'json', '--list-scanners'],
        expect.objectContaining({
          env: expect.objectContaining({
            PROMPTFOO_DELEGATED: 'true',
          }),
        }),
      );
    });

    it('should return 400 when scanners are requested without modelaudit installed', async () => {
      mockedCheckModelAuditInstalled.mockResolvedValue({ installed: false, version: null });

      const response = await request(app).get('/api/model-audit/scanners');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('ModelAudit is not installed');
      expect(mockedSpawn).not.toHaveBeenCalled();
    });

    it('should return 500 when scanner listing exits non-zero', async () => {
      mockedCheckModelAuditInstalled.mockResolvedValue({ installed: true, version: '0.2.30' });

      mockedSpawn.mockReturnValue(
        asMockChildProcess(
          createMockChildProcess({
            exitCode: 2,
            stderrData: 'scanner lookup failed',
          }),
        ),
      );

      const response = await request(app).get('/api/model-audit/scanners');

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Failed to list ModelAudit scanners');
    });

    it('should return 500 when scanner output is invalid JSON', async () => {
      mockedCheckModelAuditInstalled.mockResolvedValue({ installed: true, version: '0.2.30' });

      mockedSpawn.mockReturnValue(
        asMockChildProcess(
          createMockChildProcess({
            exitCode: 0,
            stdoutData: 'not json',
          }),
        ),
      );

      const response = await request(app).get('/api/model-audit/scanners');

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Failed to list ModelAudit scanners');
    });
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

    it('should accept timeout 0 from the UI and apply the route default', async () => {
      mockedCheckModelAuditInstalled.mockResolvedValue({ installed: true, version: '0.2.20' });

      const testFilePath = path.join(os.tmpdir(), 'test-model-audit-zero-timeout.pkl');
      fs.writeFileSync(testFilePath, 'test data');

      const mockScanOutput = JSON.stringify({
        total_checks: 1,
        passed_checks: 1,
        failed_checks: 0,
        files_scanned: 1,
        bytes_scanned: 9,
        has_errors: false,
        issues: [],
        checks: [],
      });

      mockedSpawn.mockReturnValue(
        asMockChildProcess(
          createMockChildProcess({
            exitCode: 0,
            stdoutData: mockScanOutput,
          }),
        ),
      );

      try {
        const response = await request(app)
          .post('/api/model-audit/scan')
          .send({ paths: [testFilePath], options: { timeout: 0 } });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('total_checks', 1);
        expect(mockedSpawn).toHaveBeenCalledWith(
          'modelaudit',
          expect.arrayContaining(['--timeout', '3600']),
          expect.any(Object),
        );
      } finally {
        fs.unlinkSync(testFilePath);
      }
    });

    it('should pass and persist scanner selection options', async () => {
      mockedCheckModelAuditInstalled.mockResolvedValue({ installed: true, version: '0.2.30' });

      const testFilePath = path.join(os.tmpdir(), 'test-model-audit-scanner-selection.pkl');
      fs.writeFileSync(testFilePath, 'test data');
      const createSpy = vi.spyOn(ModelAudit, 'create').mockResolvedValue({
        id: 'scan-scanner-selection',
      } as Awaited<ReturnType<typeof ModelAudit.create>>);

      const mockScanOutput = JSON.stringify({
        total_checks: 1,
        passed_checks: 1,
        failed_checks: 0,
        files_scanned: 1,
        bytes_scanned: 9,
        has_errors: false,
        issues: [],
        checks: [],
      });

      mockedSpawn.mockReturnValue(
        asMockChildProcess(
          createMockChildProcess({
            exitCode: 0,
            stdoutData: mockScanOutput,
          }),
        ),
      );

      try {
        const response = await request(app)
          .post('/api/model-audit/scan')
          .send({
            paths: [testFilePath],
            options: {
              scanners: ['pickle,tf_savedmodel'],
              excludeScanner: ['weight_distribution'],
            },
          });

        expect(response.status).toBe(200);
        expect(response.body.auditId).toBe('scan-scanner-selection');
        expect(response.body.persisted).toBe(true);
        expect(mockedSpawn).toHaveBeenCalledWith(
          'modelaudit',
          expect.arrayContaining([
            'scan',
            testFilePath,
            '--scanners',
            'pickle,tf_savedmodel',
            '--exclude-scanner',
            'weight_distribution',
          ]),
          expect.objectContaining({
            env: expect.objectContaining({
              PROMPTFOO_DELEGATED: 'true',
            }),
          }),
        );
        expect(createSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: expect.objectContaining({
              options: expect.objectContaining({
                scanners: ['pickle,tf_savedmodel'],
                excludeScanner: ['weight_distribution'],
              }),
            }),
          }),
        );
      } finally {
        createSpy.mockRestore();
        fs.unlinkSync(testFilePath);
      }
    });

    it('should not double-respond when both error and close events fire after a parse-throw', async () => {
      mockedCheckModelAuditInstalled.mockResolvedValue({ installed: true, version: '0.2.30' });

      const testFilePath = path.join(os.tmpdir(), 'test-model-audit-double-respond.pkl');
      fs.writeFileSync(testFilePath, 'test data');

      // Race `error` then `close` so both fire and both call into safeRespond.
      // Under the pre-fix code, parse threw *before* `responded = true` was
      // set, so the close emitter could re-enter safeRespond and write a
      // second body.
      const errorThenClose = {
        on: vi.fn().mockImplementation(function (
          this: object,
          event: string,
          callback: (...args: unknown[]) => void,
        ) {
          if (event === 'error') {
            setImmediate(() => callback(new Error('boom')));
          } else if (event === 'close') {
            // Fire close immediately after error so both safeRespond paths race.
            setImmediate(() => setImmediate(() => callback(1)));
          }
          return this;
        }),
      };

      const mockProc = createMockChildProcess({ exitCode: 1 });
      mockProc.on = errorThenClose.on as never;
      mockedSpawn.mockReturnValue(asMockChildProcess(mockProc));

      // Force the error-branch parse to throw on the first call. Under the
      // post-fix code `responded` flips to `true` before parse runs, so the
      // close emitter that fires next observes `responded === true` and
      // returns without entering parse a second time.
      const errorParseSpy = vi
        .spyOn(ModelAuditSchemas.Scan.ErrorResponse, 'parse')
        .mockImplementationOnce(() => {
          throw new Error('forced error-branch parse failure');
        });

      try {
        const response = await request(app)
          .post('/api/model-audit/scan')
          .timeout({ deadline: 1000 })
          .send({ paths: [testFilePath], options: { persist: false } });

        expect(response.status).toBe(500);
        expect(typeof response.body.error).toBe('string');
        // `safeRespond` calls `Scan.ErrorResponse.parse` exactly once per
        // *entered* invocation. If `responded` were not flipped before parse,
        // the close emitter would re-enter and trigger a second parse call —
        // so this single-call assertion is the proxy for "exactly one body
        // was written to the response stream".
        expect(errorParseSpy).toHaveBeenCalledTimes(1);
      } finally {
        errorParseSpy.mockRestore();
        fs.unlinkSync(testFilePath);
      }
    });

    it('should fall back to a 500 response when scan success DTO parsing fails', async () => {
      mockedCheckModelAuditInstalled.mockResolvedValue({ installed: true, version: '0.2.30' });

      const testFilePath = path.join(os.tmpdir(), 'test-model-audit-response-parse.pkl');
      fs.writeFileSync(testFilePath, 'test data');

      const mockScanOutput = JSON.stringify({
        total_checks: 1,
        passed_checks: 1,
        failed_checks: 0,
        files_scanned: 1,
        bytes_scanned: 9,
        has_errors: false,
        issues: [],
        checks: [],
      });

      mockedSpawn.mockReturnValue(
        asMockChildProcess(
          createMockChildProcess({
            exitCode: 0,
            stdoutData: mockScanOutput,
          }),
        ),
      );
      const parseSpy = vi
        .spyOn(ModelAuditSchemas.Scan.Response, 'parse')
        .mockImplementationOnce(() => {
          throw new Error('bad scan response DTO');
        });

      try {
        const response = await request(app)
          .post('/api/model-audit/scan')
          .timeout({ deadline: 1000 })
          .send({ paths: [testFilePath], options: { persist: false } });

        expect(response.status).toBe(500);
        expect(response.body).toEqual({ error: 'Error processing scan results' });
        expect(parseSpy).toHaveBeenCalled();
      } finally {
        parseSpy.mockRestore();
        fs.unlinkSync(testFilePath);
      }
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
    app = createApp();
    mockedCheckModelAuditInstalled.mockReset();
    mockedSpawn.mockReset();
    // Clean up model_audits table
    const db = getDb();
    db.run('DELETE FROM model_audits');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  async function createTestAudit(
    overrides: Partial<Parameters<typeof ModelAudit.create>[0]> & {
      createdAt?: number;
      updatedAt?: number;
      id?: string;
    } = {},
  ) {
    const { createdAt, updatedAt, id, ...createOverrides } = overrides;
    const baseData = {
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
      ...createOverrides,
    };

    if (createdAt !== undefined || updatedAt !== undefined || id !== undefined) {
      const audit = new ModelAudit({
        ...baseData,
        id,
        createdAt,
        updatedAt,
        checks: baseData.results.checks || null,
        issues: baseData.results.issues || null,
        totalChecks: baseData.results.total_checks || null,
        passedChecks: baseData.results.passed_checks || null,
        failedChecks: baseData.results.failed_checks || null,
      });
      await audit.save();
      return audit;
    }

    return ModelAudit.create(baseData);
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

    it('should use scan id as a stable tie-breaker for non-unique sort fields', async () => {
      const db = getDb();
      const scanResults = {
        total_checks: 5,
        passed_checks: 5,
        failed_checks: 0,
        has_errors: false,
        issues: [],
        checks: [],
      };
      db.insert(modelAuditsTable)
        .values([
          {
            id: 'scan-b',
            createdAt: 1,
            updatedAt: 1,
            name: 'Same name',
            modelPath: '/path/b.pkl',
            results: scanResults,
            hasErrors: false,
            totalChecks: 5,
            passedChecks: 5,
            failedChecks: 0,
          },
          {
            id: 'scan-a',
            createdAt: 2,
            updatedAt: 2,
            name: 'Same name',
            modelPath: '/path/a.pkl',
            results: scanResults,
            hasErrors: false,
            totalChecks: 5,
            passedChecks: 5,
            failedChecks: 0,
          },
        ])
        .run();

      const ascResponse = await request(app).get('/api/model-audit/scans?sort=name&order=asc');
      const descResponse = await request(app).get('/api/model-audit/scans?sort=name&order=desc');

      expect(ascResponse.status).toBe(200);
      expect(ascResponse.body.scans.map((scan: { id: string }) => scan.id)).toEqual([
        'scan-a',
        'scan-b',
      ]);
      expect(descResponse.status).toBe(200);
      expect(descResponse.body.scans.map((scan: { id: string }) => scan.id)).toEqual([
        'scan-b',
        'scan-a',
      ]);
    });

    it('should sort by id ascending', async () => {
      await createTestAudit({ name: 'Second scan' });
      await createTestAudit({ name: 'First scan' });

      const response = await request(app).get('/api/model-audit/scans?sort=id&order=asc');

      expect(response.status).toBe(200);
      expect(response.body.scans).toHaveLength(2);
      expect(response.body.scans.map((scan: { id: string }) => scan.id)).toEqual(
        [...response.body.scans.map((scan: { id: string }) => scan.id)].sort(),
      );
    });

    it('should sort by status and check counts', async () => {
      await createTestAudit({
        name: 'Clean scan',
        results: {
          total_checks: 10,
          passed_checks: 10,
          failed_checks: 0,
          has_errors: false,
          issues: [],
          checks: [],
        },
      });
      await createTestAudit({
        name: 'Issues scan',
        results: {
          total_checks: 3,
          passed_checks: 1,
          failed_checks: 2,
          has_errors: true,
          issues: [{ severity: 'error', message: 'Issue found' }],
          checks: [],
        },
      });

      const statusResponse = await request(app).get(
        '/api/model-audit/scans?sort=hasErrors&order=desc',
      );
      const checksResponse = await request(app).get(
        '/api/model-audit/scans?sort=totalChecks&order=asc',
      );

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body.scans[0].name).toBe('Issues scan');
      expect(checksResponse.status).toBe(200);
      expect(checksResponse.body.scans[0].name).toBe('Issues scan');
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
      const olderCreatedAt = Date.UTC(2026, 3, 20, 20, 13, 29);
      await createTestAudit({
        name: 'Older Scan',
        createdAt: olderCreatedAt,
        updatedAt: olderCreatedAt,
      });
      const latest = await createTestAudit({
        name: 'Newer Scan',
        createdAt: olderCreatedAt + 1000,
        updatedAt: olderCreatedAt + 1000,
      });

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
