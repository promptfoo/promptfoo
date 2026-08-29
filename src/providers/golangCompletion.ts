import { execFile } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import util from 'util';

import { getCache, isCacheEnabled } from '../cache';
import { getWrapperDir } from '../esm';
import logger from '../logger';
import { sha256 } from '../util/createHash';
import { pathExists } from '../util/file';
import { parsePathOrGlob } from '../util/index';
import { safeJsonStringify } from '../util/json';

import type {
  ApiProvider,
  CallApiContextParams,
  ProviderClassificationResponse,
  ProviderEmbeddingResponse,
  ProviderOptions,
  ProviderResponse,
} from '../types/providers';

const execFileAsync = util.promisify(execFile);

/** Entry point supplied by promptfoo; compiled alongside the provider. */
const WRAPPER_FILE = 'wrapper.go';

/**
 * Generated shim that lets `wrapper.go` reach a provider living in a named
 * package. Deliberately distinctive so Go compiler errors are never mistaken
 * for the user's own source file.
 */
const ADAPTER_FILE = 'promptfoo_adapter.go';

/**
 * Directory holding the generated entry point for named-package providers. The
 * leading dot keeps it out of `./...` so it cannot affect the user's own builds.
 */
const WRAPPER_DIR = '.promptfoo-wrapper';

/**
 * The only provider symbol `wrapper.go` knows how to dispatch to. Function names
 * may be supplied as `file://provider.go:CallApi`, but no other name resolves.
 */
const SUPPORTED_FUNCTION_NAMES = new Set(['CallApi', 'call_api']);

interface GolangProviderConfig {
  goExecutable?: string;
}

export class GolangProvider implements ApiProvider {
  config: GolangProviderConfig;

  private scriptPath: string;
  private functionName: string | null;
  public label: string | undefined;

  constructor(
    runPath: string,
    private options?: ProviderOptions,
  ) {
    const { filePath: providerPath, functionName } = parsePathOrGlob(
      options?.config.basePath || '',
      runPath,
    );
    this.scriptPath = path.relative(options?.config.basePath || '', providerPath);
    this.functionName = functionName || null;
    this.id = () => options?.id ?? `golang:${this.scriptPath}:${this.functionName || 'default'}`;
    this.label = options?.label;
    this.config = options?.config ?? {};
  }

  id() {
    return `golang:${this.scriptPath}:${this.functionName || 'default'}`;
  }

  private async findModuleRoot(startPath: string): Promise<string> {
    let currentPath = startPath;
    while (currentPath !== path.dirname(currentPath)) {
      if (await pathExists(path.join(currentPath, 'go.mod'))) {
        return currentPath;
      }
      currentPath = path.dirname(currentPath);
    }
    throw new Error('Could not find go.mod file in any parent directory');
  }

  /**
   * Works out how to compile the provider.
   *
   * A `package main` provider is compiled directly alongside `wrapper.go`, which
   * is the historical behavior. A named package cannot be: Go refuses to compile
   * two different packages in one directory. For those we build the entry point
   * in its own directory and have it import the provider through the module path
   * reported by `go list`, which keeps the provider importable and leaves
   * repository-wide commands such as `go build ./...` working.
   */
  private async prepareBuild(
    goExecutable: string,
    tempDir: string,
    scriptDir: string,
    scriptFile: string,
  ): Promise<{ buildDir: string; buildFiles: string[] }> {
    const { stdout } = await execFileAsync(goExecutable, ['list', '-json', '.'], {
      cwd: scriptDir,
    });

    let packageInfo: { ImportPath?: string; Name?: string };
    try {
      packageInfo = JSON.parse(stdout);
    } catch {
      throw new Error(`Could not parse 'go list' output for the Go provider package: ${stdout}`);
    }

    if (!packageInfo.Name || packageInfo.Name === 'main') {
      return { buildDir: scriptDir, buildFiles: [WRAPPER_FILE, scriptFile] };
    }

    if (!packageInfo.ImportPath) {
      throw new Error('Could not determine Go provider import path');
    }

    const buildDir = path.join(tempDir, WRAPPER_DIR);
    await fs.mkdir(buildDir, { recursive: true });
    await fs.writeFile(
      path.join(buildDir, ADAPTER_FILE),
      `package main\n\nimport provider ${JSON.stringify(packageInfo.ImportPath)}\n\nvar CallApi = provider.CallApi\n`,
    );
    return { buildDir, buildFiles: [WRAPPER_FILE, ADAPTER_FILE] };
  }

  private async executeGolangScript(
    prompt: string,
    context: CallApiContextParams | undefined,
    apiType: 'call_api' | 'call_embedding_api' | 'call_classification_api',
  ): Promise<any> {
    const absPath = path.resolve(path.join(this.options?.config.basePath || '', this.scriptPath));
    const moduleRoot = await this.findModuleRoot(path.dirname(absPath));
    logger.debug(`Found module root at ${moduleRoot}`);
    logger.debug(`Computing file hash for script ${absPath}`);
    const fileHash = sha256(await fs.readFile(absPath, 'utf-8'));
    const cacheKey = `golang:${this.scriptPath}:${apiType}:${fileHash}:${prompt}:${JSON.stringify(
      this.options,
    )}:${JSON.stringify(context?.vars)}`;
    const cache = await getCache();
    let cachedResult;

    if (isCacheEnabled()) {
      cachedResult = (await cache.get(cacheKey)) as string;
    }

    if (cachedResult) {
      logger.debug(`Returning cached ${apiType} result for script ${absPath}`);
      return { ...JSON.parse(cachedResult), cached: true };
    } else {
      if (context) {
        // Remove properties not useful in Golang and non-serializable objects
        // These can contain circular references (e.g., Timeout objects) that break JSON serialization
        delete context.getCache;
        delete context.logger;
        delete context.filters; // NunjucksFilterMap contains functions
        delete context.originalProvider; // ApiProvider object with methods
      }

      const args =
        apiType === 'call_api' ? [prompt, this.options, context] : [prompt, this.options];
      logger.debug(
        `Running Golang script ${absPath} with scriptPath ${this.scriptPath} and args: ${safeJsonStringify(args)}`,
      );
      // `wrapper.go` only dispatches to `CallApi`, so a custom name in the provider
      // id can never resolve. Fail with an explanation rather than letting it
      // surface as an `undefined: provider.CallApi` compile error.
      if (this.functionName && !SUPPORTED_FUNCTION_NAMES.has(this.functionName)) {
        throw new Error(
          `Go providers must export a function named 'CallApi', but '${this.scriptPath}' requested '${this.functionName}'. ` +
            `Rename the function to 'CallApi' or drop the ':${this.functionName}' suffix from the provider id.`,
        );
      }
      const functionName = this.functionName || apiType;

      let tempDir: string | undefined;
      try {
        // Create temp directory
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'golang-provider-'));

        // Helper function to copy directory recursively
        const copyDir = async (src: string, dest: string): Promise<void> => {
          await fs.mkdir(dest, { recursive: true });
          const entries = await fs.readdir(src, { withFileTypes: true });
          for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) {
              await copyDir(srcPath, destPath);
            } else {
              await fs.copyFile(srcPath, destPath);
            }
          }
        };

        // Copy the entire module structure
        await copyDir(moduleRoot, tempDir);

        const relativeScriptPath = path.relative(moduleRoot, absPath);
        const scriptDir = path.dirname(path.join(tempDir, relativeScriptPath));
        await fs.mkdir(scriptDir, { recursive: true });

        const executablePath = path.join(tempDir, 'golang_wrapper');
        const tempScriptPath = path.join(tempDir, relativeScriptPath);
        const goExecutable = this.config.goExecutable || 'go';

        const { buildDir, buildFiles } = await this.prepareBuild(
          goExecutable,
          tempDir,
          scriptDir,
          path.basename(relativeScriptPath),
        );

        await fs.copyFile(
          path.join(getWrapperDir('golang'), 'wrapper.go'),
          path.join(buildDir, WRAPPER_FILE),
        );

        await execFileAsync(goExecutable, ['build', '-o', executablePath, ...buildFiles], {
          cwd: buildDir,
        });

        const jsonArgs = safeJsonStringify(args) || '[]';
        logger.debug(`Running Go executable: ${executablePath}`);

        // Execute compiled binary with args (no shell escaping needed)
        const { stdout, stderr } = await execFileAsync(executablePath, [
          tempScriptPath,
          functionName,
          jsonArgs,
        ]);
        if (stderr) {
          logger.error(`Golang script stderr: ${stderr}`);
        }
        logger.debug(`Golang script stdout: ${stdout}`);

        const result = JSON.parse(stdout);

        if (isCacheEnabled() && !('error' in result)) {
          await cache.set(cacheKey, JSON.stringify(result));
        }
        return result;
      } catch (error) {
        logger.error(`Error running Golang script: ${(error as Error).message}`);
        logger.error(`Full error object: ${JSON.stringify(error)}`);
        throw new Error(`Error running Golang script: ${(error as Error).message}`);
      } finally {
        // Clean up temporary directory
        if (tempDir) {
          await fs.rm(tempDir, { recursive: true, force: true });
        }
      }
    }
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    return this.executeGolangScript(prompt, context, 'call_api');
  }

  async callEmbeddingApi(prompt: string): Promise<ProviderEmbeddingResponse> {
    return this.executeGolangScript(prompt, undefined, 'call_embedding_api');
  }

  async callClassificationApi(prompt: string): Promise<ProviderClassificationResponse> {
    return this.executeGolangScript(prompt, undefined, 'call_classification_api');
  }
}
