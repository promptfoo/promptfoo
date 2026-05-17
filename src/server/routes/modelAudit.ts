import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { StringDecoder } from 'string_decoder';

import { Router } from 'express';
import { z } from 'zod';
import { checkModelAuditInstalled } from '../../commands/modelScan';
import logger from '../../logger';
import ModelAudit from '../../models/modelAudit';
import telemetry from '../../telemetry';
import { ModelAuditSchemas, type ScanRequest } from '../../types/api/modelAudit';
import { parseModelAuditArgs } from '../../util/modelAuditCliParser';
import { parseCompleteModelAuditResults } from '../../util/modelAuditResults';
import { replyValidationError, sendError } from '../utils/errors';
import type { Request, Response } from 'express';

import type { ModelAuditScanResults } from '../../types/modelAudit';

export const modelAuditRouter = Router();

const LIST_SCANNERS_ARGS = parseModelAuditArgs([], {
  listScanners: true,
  format: 'json',
}).args;

function getModelAuditDelegationEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PROMPTFOO_DELEGATED: 'true',
  };
}

interface SpawnCaptureOptions {
  /** Abort signal to terminate the child process (e.g. on client disconnect). */
  signal?: AbortSignal;
}

type NormalizedScanOptions = ScanRequest['options'] & {
  maxSize?: string;
};

type SafeScanResponder = (statusCode: number, body: object) => void;

type ScanErrorBody = {
  error: string;
  suggestion?: string;
  type?: string;
};

type ScanCloseContext = {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  args: string[];
  originalPaths: string[];
  resolvedPaths: string[];
  normalizedOptions: NormalizedScanOptions;
  persist: boolean;
  scannerVersion: string | null;
  safeRespond: SafeScanResponder;
};

const SCAN_FAILURE_PATTERNS: Array<{
  patterns: string[];
  error: string;
  type: string;
  suggestion: string;
}> = [
  {
    patterns: ['permission denied', 'access denied'],
    error: 'Permission denied: Unable to access the specified files or directories',
    type: 'permission_error',
    suggestion: 'Check that the files exist and you have read permissions',
  },
  {
    patterns: ['file not found', 'no such file'],
    error: 'Files or directories not found',
    type: 'file_not_found',
    suggestion: 'Verify the file paths are correct and the files exist',
  },
  {
    patterns: ['out of memory', 'memory'],
    error: 'Insufficient memory to complete the scan',
    type: 'memory_error',
    suggestion: 'Try scanning smaller files or reducing the number of files scanned at once',
  },
  {
    patterns: ['timeout', 'timed out'],
    error: 'Scan operation timed out',
    type: 'timeout_error',
    suggestion: 'Try increasing the timeout value or scanning fewer files',
  },
  {
    patterns: ['invalid', 'malformed'],
    error: 'Invalid or malformed model files detected',
    type: 'invalid_model',
    suggestion: 'Ensure the files are valid model files and not corrupted',
  },
  {
    patterns: ['unsupported'],
    error: 'Unsupported model format or file type',
    type: 'unsupported_format',
    suggestion: 'Check the modelaudit documentation for supported file formats',
  },
  {
    patterns: ['connection', 'network'],
    error: 'Network or connection error during scan',
    type: 'network_error',
    suggestion: 'Check your internet connection if the scan requires downloading external resources',
  },
  {
    patterns: ['disk space', 'no space'],
    error: 'Insufficient disk space',
    type: 'disk_space_error',
    suggestion: 'Free up disk space and try again',
  },
  {
    patterns: ['python version'],
    error: 'Python version compatibility issue',
    type: 'python_version_error',
    suggestion: 'Check that you have a supported Python version installed',
  },
  {
    patterns: ['no such option', 'unrecognized option'],
    error: 'Invalid command line option provided to modelaudit',
    type: 'invalid_option_error',
    suggestion: 'Check that all command line options are supported by the current modelaudit version',
  },
  {
    patterns: ['usage:', 'try'],
    error: 'Invalid command syntax or arguments',
    type: 'usage_error',
    suggestion: 'Review the command arguments. The modelaudit usage help is shown in stderr.',
  },
];

function spawnModelAuditCapture(
  args: string[],
  options: SpawnCaptureOptions = {},
): Promise<{
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn('modelaudit', args, {
      env: getModelAuditDelegationEnv(),
    });
    let stdout = '';
    let stderr = '';
    const stdoutDecoder = new StringDecoder('utf8');
    const stderrDecoder = new StringDecoder('utf8');

    const onAbort = () => {
      if (!child.killed) {
        child.kill('SIGTERM');
      }
    };
    if (options.signal?.aborted) {
      onAbort();
    } else {
      options.signal?.addEventListener('abort', onAbort, { once: true });
    }
    const cleanupAbort = () => options.signal?.removeEventListener('abort', onAbort);

    child.stdout?.on('data', (data) => {
      stdout += stdoutDecoder.write(data);
    });

    child.stderr?.on('data', (data) => {
      stderr += stderrDecoder.write(data);
    });

    child.on('error', (error) => {
      cleanupAbort();
      reject(error);
    });
    child.on('close', (code, signal) => {
      cleanupAbort();
      stdout += stdoutDecoder.end();
      stderr += stderrDecoder.end();
      resolve({ code, signal: signal ?? null, stdout, stderr });
    });
  });
}

function includesAll(source: string, patterns: string[]): boolean {
  return patterns.every((pattern) => source.includes(pattern));
}

function includesAny(source: string, patterns: string[]): boolean {
  return patterns.some((pattern) => source.includes(pattern));
}

function getScanFailureResponse(stderr: string, code: number): ScanErrorBody {
  const stderrLower = stderr.toLowerCase();
  const failure = SCAN_FAILURE_PATTERNS.find(({ patterns, type }) =>
    type === 'usage_error' ? includesAll(stderrLower, patterns) : includesAny(stderrLower, patterns),
  );

  if (!failure) {
    return { error: `Model scan failed with exit code ${code}` };
  }

  return {
    error: failure.error,
    type: failure.type,
    suggestion: failure.suggestion,
  };
}

function getProcessTerminationResponse(
  code: number | null,
  signal: NodeJS.Signals | null,
): ScanErrorBody | undefined {
  if (signal !== null) {
    return { error: `Model scan process terminated by signal ${signal}` };
  }
  if (code === null) {
    return { error: 'Model scan process exited without an exit code' };
  }
  return undefined;
}

function parseScanOutput(
  jsonOutput: string,
  context: Pick<ScanCloseContext, 'args' | 'resolvedPaths' | 'stderr' | 'code'>,
): ModelAuditScanResults | undefined {
  try {
    return parseCompleteModelAuditResults(JSON.parse(jsonOutput));
  } catch (parseError) {
    logger.error('Failed to parse model scan output', {
      parseError,
      output: jsonOutput.substring(0, 1000),
      stderr: context.stderr || undefined,
      command: 'modelaudit',
      args: context.args,
      paths: context.resolvedPaths,
      exitCode: context.code,
    });
    return undefined;
  }
}

function buildPersistedScanMetadataOptions(options: NormalizedScanOptions) {
  return {
    blacklist: options.blacklist,
    timeout: options.timeout,
    maxSize: options.maxSize,
    verbose: options.verbose,
    format: options.format,
    strict: options.strict,
    dryRun: options.dryRun,
    cache: options.cache,
    quiet: options.quiet,
    progress: options.progress,
    sbom: options.sbom,
    output: options.output,
    scanners: options.scanners,
    excludeScanner: options.excludeScanner,
  };
}

async function persistScanResults({
  scanResults,
  jsonOutput,
  normalizedOptions,
  resolvedPaths,
  originalPaths,
  scannerVersion,
}: Pick<
  ScanCloseContext,
  'normalizedOptions' | 'resolvedPaths' | 'originalPaths' | 'scannerVersion'
> & {
  scanResults: ModelAuditScanResults;
  jsonOutput: string;
}): Promise<string | undefined> {
  try {
    const audit = await ModelAudit.create({
      name: normalizedOptions.name || `API scan ${new Date().toISOString()}`,
      author: normalizedOptions.author ?? undefined,
      modelPath: resolvedPaths.join(', '),
      results: {
        ...scanResults,
        rawOutput: jsonOutput,
      },
      metadata: {
        paths: resolvedPaths,
        originalPaths,
        options: buildPersistedScanMetadataOptions(normalizedOptions),
      },
      scannerVersion: scannerVersion ?? undefined,
      contentHash: scanResults.content_hash,
    });
    logger.info(`Model scan results saved to database with ID: ${audit.id}`);
    return audit.id;
  } catch (dbError) {
    logger.error(`Failed to save scan results to database: ${dbError}`);
    return undefined;
  }
}

async function handleSuccessfulScan({
  stdout,
  stderr,
  args,
  resolvedPaths,
  originalPaths,
  code,
  normalizedOptions,
  persist,
  scannerVersion,
  safeRespond,
}: ScanCloseContext): Promise<void> {
  const jsonOutput = stdout.trim();
  if (!jsonOutput) {
    logger.error('No output from model scan', {
      stderr: stderr || undefined,
      command: 'modelaudit',
      args,
      paths: resolvedPaths,
      exitCode: code,
    });
    safeRespond(500, {
      error: 'No output received from model scan',
      suggestion:
        'The scan may have failed silently. Check that the model files are valid and accessible.',
    });
    return;
  }

  const scanResults = parseScanOutput(jsonOutput, { args, resolvedPaths, stderr, code });
  if (!scanResults) {
    safeRespond(500, {
      error: 'Failed to parse scan results - invalid JSON output',
      suggestion:
        'The model scan may have produced invalid output. Check the raw output for error messages.',
    });
    return;
  }

  const auditId = persist
    ? await persistScanResults({
        scanResults,
        jsonOutput,
        normalizedOptions,
        resolvedPaths,
        originalPaths,
        scannerVersion,
      })
    : undefined;

  safeRespond(200, {
    ...scanResults,
    rawOutput: jsonOutput,
    ...(auditId && { auditId }),
    persisted: persist && !!auditId,
  });
}

async function handleModelAuditClose(context: ScanCloseContext): Promise<void> {
  try {
    const terminationResponse = getProcessTerminationResponse(context.code, context.signal);
    if (terminationResponse) {
      logger.error('Model scan process did not complete normally', {
        code: context.code,
        signal: context.signal,
        stderr: context.stderr || undefined,
        command: 'modelaudit',
        args: context.args,
        paths: context.resolvedPaths,
      });
      context.safeRespond(500, terminationResponse);
      return;
    }

    const exitCode = context.code;
    if (exitCode === null) {
      return;
    }

    if (exitCode !== 0 && exitCode !== 1) {
      logger.error('Model scan failed', {
        exitCode,
        stderr: context.stderr || undefined,
        command: 'modelaudit',
        args: context.args,
        paths: context.resolvedPaths,
      });
      context.safeRespond(500, getScanFailureResponse(context.stderr, exitCode));
      return;
    }

    await handleSuccessfulScan(context);
  } catch (error) {
    logger.error('Error processing model scan results', { error });
    context.safeRespond(500, {
      error: 'Error processing scan results',
    });
  }
}

// Check if modelaudit is installed
modelAuditRouter.get('/check-installed', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { installed, version } = await checkModelAuditInstalled();
    res.json(
      ModelAuditSchemas.CheckInstalled.Response.parse({ installed, version, cwd: process.cwd() }),
    );
  } catch {
    res.json(
      ModelAuditSchemas.CheckInstalled.Response.parse({
        installed: false,
        version: null,
        cwd: process.cwd(),
      }),
    );
  }
});

modelAuditRouter.get('/scanners', async (req: Request, res: Response): Promise<void> => {
  const abortController = new AbortController();
  const onClientClose = () => abortController.abort();
  req.on('close', onClientClose);

  try {
    const { installed } = await checkModelAuditInstalled();
    if (!installed) {
      res.status(400).json({
        error: 'ModelAudit is not installed. Please install it using: pip install modelaudit',
      });
      return;
    }

    const { code, signal, stdout, stderr } = await spawnModelAuditCapture(LIST_SCANNERS_ARGS, {
      signal: abortController.signal,
    });

    if (abortController.signal.aborted) {
      return;
    }

    if (signal !== null || code === null || code !== 0) {
      sendError(res, 500, 'Failed to list ModelAudit scanners', { code, signal, stderr });
      return;
    }

    const parsedOutput = JSON.parse(stdout);
    res.json(ModelAuditSchemas.ListScanners.Response.parse(parsedOutput));
  } catch (error) {
    if (abortController.signal.aborted) {
      return;
    }
    sendError(res, 500, 'Failed to list ModelAudit scanners', error);
  } finally {
    req.removeListener('close', onClientClose);
  }
});

// Check path type
modelAuditRouter.post('/check-path', async (req: Request, res: Response): Promise<void> => {
  const bodyResult = ModelAuditSchemas.CheckPath.Request.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: z.prettifyError(bodyResult.error) });
    return;
  }

  try {
    const { path: inputPath } = bodyResult.data;

    // Handle home directory expansion
    let expandedPath = inputPath;
    if (expandedPath.startsWith('~/')) {
      expandedPath = path.join(os.homedir(), expandedPath.slice(2));
    }

    const absolutePath = path.isAbsolute(expandedPath)
      ? expandedPath
      : path.resolve(process.cwd(), expandedPath);

    // Treat any access failure (ENOENT, EACCES, EPERM, ELOOP, ...) as not-exists,
    // matching the historical fs.existsSync behavior the UI depends on.
    let stats;
    try {
      stats = await fs.stat(absolutePath);
    } catch {
      res.json(ModelAuditSchemas.CheckPath.Response.parse({ exists: false, type: null }));
      return;
    }

    const type = stats.isDirectory() ? 'directory' : 'file';

    res.json(
      ModelAuditSchemas.CheckPath.Response.parse({
        exists: true,
        type,
        absolutePath,
        name: path.basename(absolutePath),
      }),
    );
  } catch (error) {
    sendError(res, 500, 'Failed to check path', error);
  }
});

// Run model scan
modelAuditRouter.post('/scan', async (req: Request, res: Response): Promise<void> => {
  const bodyResult = ModelAuditSchemas.Scan.Request.safeParse(req.body);
  if (!bodyResult.success) {
    replyValidationError(res, bodyResult.error);
    return;
  }

  try {
    const { paths, options } = bodyResult.data;

    // Check if modelaudit is installed
    const { installed, version: scannerVersion } = await checkModelAuditInstalled();
    if (!installed) {
      res.status(400).json({
        error: 'ModelAudit is not installed. Please install it using: pip install modelaudit',
      });
      return;
    }

    // Resolve paths to absolute paths
    const resolvedPaths: string[] = [];
    for (const inputPath of paths) {
      // Skip empty paths
      if (!inputPath || inputPath.trim() === '') {
        continue;
      }

      // Handle home directory expansion
      let expandedPath = inputPath;
      if (expandedPath.startsWith('~/')) {
        expandedPath = path.join(os.homedir(), expandedPath.slice(2));
      }

      const absolutePath = path.isAbsolute(expandedPath)
        ? expandedPath
        : path.resolve(process.cwd(), expandedPath);

      try {
        await fs.access(absolutePath);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        const message =
          code === 'ENOENT'
            ? `Path does not exist: ${inputPath} (resolved to: ${absolutePath})`
            : `Cannot access path: ${inputPath} (resolved to: ${absolutePath}, ${code ?? 'unknown error'})`;
        res.status(400).json({ error: message });
        return;
      }

      resolvedPaths.push(absolutePath);
    }

    if (resolvedPaths.length === 0) {
      res.status(400).json({ error: 'No valid paths to scan' });
      return;
    }

    const normalizedOptions = {
      ...options,
      maxSize: options.maxSize ?? options.maxFileSize,
    };

    // Use the centralized CLI parser to build command arguments
    const effectiveVerbose = normalizedOptions.verbose !== false;
    const effectiveTimeout = normalizedOptions.timeout || 3600;
    const { args } = parseModelAuditArgs(resolvedPaths, {
      ...normalizedOptions,
      // Force JSON format for API responses (required for parsing)
      format: 'json',
      // Enable verbose mode by default for better debugging information
      verbose: effectiveVerbose, // Allow explicit false to disable
      // Set default timeout to 1 hour for large model scans
      timeout: effectiveTimeout,
      // Note: We handle persistence ourselves in this server route
    });

    logger.info(`Running model scan on: ${resolvedPaths.join(', ')}`);

    // Default to persisting results unless explicitly disabled
    const persist = normalizedOptions.persist !== false;

    // Track the scan
    telemetry.record('webui_api', {
      event: 'model_scan',
      pathCount: paths.length,
      hasBlacklist: (normalizedOptions.blacklist?.length ?? 0) > 0,
      hasScannerSelection: Boolean(
        normalizedOptions.scanners?.length || normalizedOptions.excludeScanner?.length,
      ),
      timeout: effectiveTimeout,
      verbose: effectiveVerbose,
      persist,
    });

    // Run the scan
    const modelAudit = spawn('modelaudit', args, { env: getModelAuditDelegationEnv() });
    let stdout = '';
    let stderr = '';
    const stdoutDecoder = new StringDecoder('utf8');
    const stderrDecoder = new StringDecoder('utf8');
    let responded = false; // Prevent double-response

    // Helper to safely send response (prevents double-response if both error and close fire).
    //
    // Mark `responded = true` BEFORE running the schema parse: this runs inside
    // child-process event callbacks where a thrown ZodError would propagate as
    // an unhandled exception and leave `responded = false`, allowing a second
    // emitter (e.g. `close` after `error`) to fire and double-send. If the
    // parse fails, fall back to a hand-built error envelope so the client
    // still receives a valid response.
    const safeRespond = (statusCode: number, body: object) => {
      if (responded) {
        return;
      }
      responded = true;
      const isSuccess = statusCode >= 200 && statusCode < 300;
      try {
        const parsed = isSuccess
          ? ModelAuditSchemas.Scan.Response.parse(body)
          : ModelAuditSchemas.Scan.ErrorResponse.parse(body);
        res.status(statusCode).json(parsed);
      } catch (parseError) {
        // Match the existing logging style in this file (e.g.
        // `logger.error('Failed to parse model scan output', { parseError, ... })`)
        // by passing the raw error value so the logger sanitizer can preserve
        // the stack and other diagnostic context.
        logger.error('safeRespond DTO parse failed; sending fallback envelope', {
          parseError,
          statusCode,
        });
        // A parse failure on either branch means the response cannot be trusted.
        // Always degrade to 500 with a deterministic envelope so clients see a
        // clear failure instead of an empty body or a stack trace from Express.
        const fallbackError =
          !isSuccess && 'error' in body && typeof body.error === 'string'
            ? body.error
            : 'Error processing scan results';
        res.status(500).json({ error: fallbackError });
      }
    };

    // Clean up child process if client disconnects
    const cleanup = () => {
      if (!modelAudit.killed) {
        logger.debug('Client disconnected, killing modelaudit process');
        modelAudit.kill('SIGTERM');
      }
    };

    // Handle client disconnect (request abort)
    req.on('close', () => {
      if (!responded) {
        cleanup();
      }
    });

    modelAudit.stdout.on('data', (data) => {
      stdout += stdoutDecoder.write(data);
    });

    modelAudit.stderr.on('data', (data) => {
      stderr += stderrDecoder.write(data);
    });

    modelAudit.on('error', (error) => {
      logger.error(`Failed to start modelaudit: ${error.message}`);

      let errorMessage = 'Failed to start model scan';
      let suggestion = 'Make sure Python and modelaudit are installed and available in your PATH.';

      if (error.message.includes('ENOENT') || error.message.includes('not found')) {
        errorMessage = 'ModelAudit command not found';
        suggestion = 'Install modelaudit using: pip install modelaudit';
      } else if (error.message.includes('EACCES')) {
        errorMessage = 'Permission denied when trying to execute modelaudit';
        suggestion = 'Check that modelaudit is executable and you have the necessary permissions';
      }

      logger.error('Failed to start modelaudit', {
        error: error.message,
        command: 'modelaudit',
        args,
        paths: resolvedPaths,
      });
      safeRespond(500, {
        error: errorMessage,
        suggestion,
      });
    });

    modelAudit.on('close', async (code, signal) => {
      // If client already disconnected, don't process results
      if (responded) {
        return;
      }

      stdout += stdoutDecoder.end();
      stderr += stderrDecoder.end();
      await handleModelAuditClose({
        code,
        signal: signal ?? null,
        stdout,
        stderr,
        args,
        originalPaths: paths,
        resolvedPaths,
        normalizedOptions,
        persist,
        scannerVersion,
        safeRespond,
      });
    });
  } catch (error) {
    sendError(res, 500, 'Failed to start model scan', error);
  }
});

// Get all model scans with pagination support
modelAuditRouter.get('/scans', async (req: Request, res: Response): Promise<void> => {
  const queryResult = ModelAuditSchemas.ListScans.Query.safeParse(req.query);
  if (!queryResult.success) {
    res.status(400).json({ error: z.prettifyError(queryResult.error) });
    return;
  }

  try {
    const { limit, offset, sort, order, search } = queryResult.data;

    const audits = await ModelAudit.getMany(limit, offset, sort, order, search);
    const total = await ModelAudit.count(search);

    res.json(
      ModelAuditSchemas.ListScans.Response.parse({
        scans: audits.map((audit) => audit.toJSON()),
        total,
        limit,
        offset,
      }),
    );
  } catch (error) {
    sendError(res, 500, 'Failed to fetch model scans', error);
  }
});

// IMPORTANT: /scans/latest must be defined BEFORE /scans/:id to prevent
// "latest" from being matched as an :id parameter
// Get the latest/most recent model scan
modelAuditRouter.get('/scans/latest', async (_req: Request, res: Response): Promise<void> => {
  try {
    const audits = await ModelAudit.getMany(1, 0, 'createdAt', 'desc');

    if (audits.length === 0) {
      res.status(404).json({ error: 'No scans found' });
      return;
    }

    res.json(ModelAuditSchemas.GetLatestScan.Response.parse(audits[0].toJSON()));
  } catch (error) {
    sendError(res, 500, 'Failed to fetch latest model scan', error);
  }
});

// Get specific model scan by ID (must be after /scans/latest)
modelAuditRouter.get('/scans/:id', async (req: Request, res: Response): Promise<void> => {
  const paramsResult = ModelAuditSchemas.GetScan.Params.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ error: z.prettifyError(paramsResult.error) });
    return;
  }

  try {
    const audit = await ModelAudit.findById(paramsResult.data.id);

    if (!audit) {
      res.status(404).json({ error: 'Model scan not found' });
      return;
    }

    res.json(ModelAuditSchemas.GetScan.Response.parse(audit.toJSON()));
  } catch (error) {
    sendError(res, 500, 'Failed to fetch model scan', error);
  }
});

// Delete model scan
modelAuditRouter.delete('/scans/:id', async (req: Request, res: Response): Promise<void> => {
  const paramsResult = ModelAuditSchemas.DeleteScan.Params.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ error: z.prettifyError(paramsResult.error) });
    return;
  }

  try {
    const audit = await ModelAudit.findById(paramsResult.data.id);

    if (!audit) {
      res.status(404).json({ error: 'Model scan not found' });
      return;
    }

    await audit.delete();
    res.json(
      ModelAuditSchemas.DeleteScan.Response.parse({
        success: true,
        message: 'Model scan deleted successfully',
      }),
    );
  } catch (error) {
    sendError(res, 500, 'Failed to delete model scan', error);
  }
});
