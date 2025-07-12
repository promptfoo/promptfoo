import { Request, Response } from 'express';
import { exec } from 'child_process';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { modelAuditRouter } from '../../src/server/routes/modelAudit';
import { ApiSchemas } from '../../src/server/apiSchemas';

jest.mock('child_process');
jest.mock('fs');
jest.mock('os');
jest.mock('../../src/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
}));
jest.mock('../../src/telemetry', () => ({
  record: jest.fn(),
}));

describe('Model Audit Routes', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockExecCallback: any;
  let mockSpawnProcess: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      params: {},
      query: {},
      body: {},
    };

    mockResponse = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    // Mock exec for check-installed
    (exec as jest.Mock).mockImplementation((cmd, callback) => {
      mockExecCallback = callback;
      return {};
    });

    // Mock spawn for scan
    mockSpawnProcess = {
      stdout: {
        on: jest.fn(),
      },
      stderr: {
        on: jest.fn(),
      },
      on: jest.fn(),
    };
    (spawn as jest.Mock).mockReturnValue(mockSpawnProcess);
  });

  describe('GET /check-installed', () => {
    it('should return installed:true when modelaudit is installed', async () => {
      mockExecCallback = null;
      (exec as jest.Mock).mockImplementation((cmd, callback) => {
        callback(null, '', '');
        return {};
      });

      const route = modelAuditRouter.stack.find(
        (layer) => layer.route?.path === '/check-installed' && layer.route.methods.get
      );
      await route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        installed: true,
        cwd: process.cwd(),
      });
    });

    it('should return installed:false when modelaudit is not installed', async () => {
      mockExecCallback = null;
      (exec as jest.Mock).mockImplementation((cmd, callback) => {
        callback(new Error('Module not found'), '', '');
        return {};
      });

      const route = modelAuditRouter.stack.find(
        (layer) => layer.route?.path === '/check-installed' && layer.route.methods.get
      );
      await route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        installed: false,
        cwd: process.cwd(),
      });
    });

    it('should validate response matches DTO schema', async () => {
      mockExecCallback = null;
      (exec as jest.Mock).mockImplementation((cmd, callback) => {
        callback(null, '', '');
        return {};
      });

      const route = modelAuditRouter.stack.find(
        (layer) => layer.route?.path === '/check-installed' && layer.route.methods.get
      );
      await route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);

      const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(() => ApiSchemas.ModelAudit.CheckInstalled.Response.parse(responseData)).not.toThrow();
    });
  });

  describe('POST /check-path', () => {
    beforeEach(() => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.statSync as jest.Mock).mockReturnValue({
        isDirectory: jest.fn().mockReturnValue(false),
      });
      (os.homedir as jest.Mock).mockReturnValue('/Users/test');
    });

    it('should check if a file path exists', async () => {
      const testPath = '/test/file.py';
      mockRequest.body = { path: testPath };

      const route = modelAuditRouter.stack.find(
        (layer) => layer.route?.path === '/check-path' && layer.route.methods.post
      );
      await route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        exists: true,
        type: 'file',
        absolutePath: testPath,
        name: 'file.py',
      });
    });

    it('should check if a directory path exists', async () => {
      const testPath = '/test/dir';
      mockRequest.body = { path: testPath };

      (fs.statSync as jest.Mock).mockReturnValue({
        isDirectory: jest.fn().mockReturnValue(true),
      });

      const route = modelAuditRouter.stack.find(
        (layer) => layer.route?.path === '/check-path' && layer.route.methods.post
      );
      await route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        exists: true,
        type: 'directory',
        absolutePath: testPath,
        name: 'dir',
      });
    });

    it('should handle non-existent paths', async () => {
      mockRequest.body = { path: '/non/existent' };
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const route = modelAuditRouter.stack.find(
        (layer) => layer.route?.path === '/check-path' && layer.route.methods.post
      );
      await route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        exists: false,
        type: null,
      });
    });

    it('should return 400 for missing path', async () => {
      mockRequest.body = {};

      const route = modelAuditRouter.stack.find(
        (layer) => layer.route?.path === '/check-path' && layer.route.methods.post
      );
      await route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(String) })
      );
    });

    it('should validate request and response match DTO schemas', async () => {
      const testPath = '/test/file.py';
      mockRequest.body = { path: testPath };

      // Validate request
      expect(() => ApiSchemas.ModelAudit.CheckPath.Request.parse(mockRequest.body)).not.toThrow();

      const route = modelAuditRouter.stack.find(
        (layer) => layer.route?.path === '/check-path' && layer.route.methods.post
      );
      await route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);

      // Validate response
      const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(() => ApiSchemas.ModelAudit.CheckPath.Response.parse(responseData)).not.toThrow();
    });
  });

  describe('POST /scan', () => {
    beforeEach(() => {
      // Mock successful modelaudit check
      (exec as jest.Mock).mockImplementation((cmd, callback) => {
        callback(null, '', '');
        return {};
      });

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (os.homedir as jest.Mock).mockReturnValue('/Users/test');
    });

    it('should scan paths successfully with JSON output', async () => {
      const testPaths = ['/test/model1.h5', '/test/model2.pkl'];
      mockRequest.body = { paths: testPaths };

      const mockJsonOutput = JSON.stringify({
        issues: [
          {
            severity: 'warning',
            message: 'Potential security issue found',
            location: '/test/model1.h5',
            type: 'pickle_import',
          },
        ],
        files_scanned: 2,
        files_total: 2,
        scan_duration: 1.23,
      });

      const route = modelAuditRouter.stack.find(
        (layer) => layer.route?.path === '/scan' && layer.route.methods.post
      );
      
      // Start the request, which will set up the event handlers
      const promise = route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);

      // Wait a moment for event handlers to be set up
      await new Promise(resolve => setImmediate(resolve));

      // Get the callbacks that were registered
      const stdoutCallback = mockSpawnProcess.stdout.on.mock.calls.find(
        call => call[0] === 'data'
      )?.[1];
      const closeCallback = mockSpawnProcess.on.mock.calls.find(
        call => call[0] === 'close'
      )?.[1];

      // Simulate modelaudit output
      if (stdoutCallback) {
        stdoutCallback(Buffer.from(mockJsonOutput));
      }
      if (closeCallback) {
        closeCallback(0);
      }

      await promise;

      expect(spawn).toHaveBeenCalledWith('modelaudit', expect.arrayContaining(['scan', expect.any(String), expect.any(String), '--format', 'json']));
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        results: {
          totalFiles: 2,
          scannedFiles: 2,
          findings: [{
            file: '/test/model1.h5',
            severity: 'medium',
            type: 'pickle_import',
            message: 'Potential security issue found',
            details: {
              location: '/test/model1.h5',
              message: 'Potential security issue found',
              severity: 'warning',
              type: 'pickle_import',
            },
          }],
          summary: {
            critical: 0,
            high: 0,
            medium: 1,
            low: 0,
          },
        },
      });
    });

    it('should handle scan with options', async () => {
      mockRequest.body = {
        paths: ['/test/models'],
        options: {
          exclude: ['*.tmp', '*.backup'],
          timeout: 60,
          maxFileSize: 1000000,
          verbose: true,
        },
      };

      const route = modelAuditRouter.stack.find(
        (layer) => layer.route?.path === '/scan' && layer.route.methods.post
      );
      
      const promise = route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
      
      // Wait a moment for event handlers to be set up
      await new Promise(resolve => setImmediate(resolve));

      // Get the callbacks that were registered
      const stdoutCallback = mockSpawnProcess.stdout.on.mock.calls.find(
        call => call[0] === 'data'
      )?.[1];
      const closeCallback = mockSpawnProcess.on.mock.calls.find(
        call => call[0] === 'close'
      )?.[1];

      // Simulate empty JSON output
      if (stdoutCallback) {
        stdoutCallback(Buffer.from('{"issues": []}'));
      }
      if (closeCallback) {
        closeCallback(0);
      }

      await promise;

      // The spawn call should contain the correct arguments in order
      const spawnArgs = (spawn as jest.Mock).mock.calls[0][1];
      expect(spawn).toHaveBeenCalledTimes(1);
      expect(spawn).toHaveBeenCalledWith('modelaudit', expect.any(Array));
      
      // Check that all expected arguments are present
      expect(spawnArgs).toContain('scan');
      expect(spawnArgs).toContain('/test/models');
      expect(spawnArgs).toContain('--blacklist');
      expect(spawnArgs).toContain('*.tmp');
      expect(spawnArgs).toContain('*.backup');
      expect(spawnArgs).toContain('--format');
      expect(spawnArgs).toContain('json');
      expect(spawnArgs).toContain('--verbose');
    });

    it('should return 400 when no paths provided', async () => {
      mockRequest.body = { paths: [] };

      const route = modelAuditRouter.stack.find(
        (layer) => layer.route?.path === '/scan' && layer.route.methods.post
      );
      await route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'No paths provided' });
    });

    it('should return 400 when modelaudit is not installed', async () => {
      mockRequest.body = { paths: ['/test/model.h5'] };
      
      // Mock modelaudit not installed
      (exec as jest.Mock).mockImplementation((cmd, callback) => {
        callback(new Error('Module not found'), '', '');
        return {};
      });

      const route = modelAuditRouter.stack.find(
        (layer) => layer.route?.path === '/scan' && layer.route.methods.post
      );
      await route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'ModelAudit is not installed. Please install it using: pip install modelaudit',
      });
    });

    it('should handle non-existent scan paths', async () => {
      mockRequest.body = { paths: ['/non/existent/path'] };
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const route = modelAuditRouter.stack.find(
        (layer) => layer.route?.path === '/scan' && layer.route.methods.post
      );
      await route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ 
          error: expect.stringContaining('Path does not exist')
        })
      );
    });

    it('should validate request and response match DTO schemas', async () => {
      const testRequest = {
        paths: ['/test/model.h5'],
        options: {
          exclude: ['*.tmp'],
          timeout: 30,
        },
      };
      mockRequest.body = testRequest;

      // Validate request
      expect(() => ApiSchemas.ModelAudit.Scan.Request.parse(mockRequest.body)).not.toThrow();

      const mockJsonOutput = JSON.stringify({
        issues: [],
        files_scanned: 1,
        files_total: 1,
      });

      const route = modelAuditRouter.stack.find(
        (layer) => layer.route?.path === '/scan' && layer.route.methods.post
      );
      
      const promise = route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);

      // Wait a moment for event handlers to be set up
      await new Promise(resolve => setImmediate(resolve));

      // Get the callbacks that were registered
      const stdoutCallback = mockSpawnProcess.stdout.on.mock.calls.find(
        call => call[0] === 'data'
      )?.[1];
      const closeCallback = mockSpawnProcess.on.mock.calls.find(
        call => call[0] === 'close'
      )?.[1];

      // Simulate output
      if (stdoutCallback) {
        stdoutCallback(Buffer.from(mockJsonOutput));
      }
      if (closeCallback) {
        closeCallback(0);
      }

      await promise;

      // Validate response
      const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(() => ApiSchemas.ModelAudit.Scan.Response.parse(responseData)).not.toThrow();
    });

    it('should handle modelaudit process errors', async () => {
      mockRequest.body = { paths: ['/test/model.h5'] };

      const route = modelAuditRouter.stack.find(
        (layer) => layer.route?.path === '/scan' && layer.route.methods.post
      );
      
      const promise = route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);

      // Wait a moment for event handlers to be set up
      await new Promise(resolve => setImmediate(resolve));

      // Get the error callback that was registered
      const errorCallback = mockSpawnProcess.on.mock.calls.find(
        call => call[0] === 'error'
      )?.[1];

      // Simulate error
      if (errorCallback) {
        errorCallback(new Error('Failed to start process'));
      }

      await promise;

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Failed to start model scan. Make sure Python and modelaudit are installed.',
      });
    });
  });
});