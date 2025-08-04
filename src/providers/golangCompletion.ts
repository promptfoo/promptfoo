import { exec } from 'child_process';
import { promises as fs } from 'fs';
import { mkdtempSync } from 'fs';
import os from 'os';
import path from 'path';
import util from 'util';

import { getCache, isCacheEnabled } from '../cache';
import logger from '../logger';
import { parsePathOrGlob } from '../util';
import { sha256 } from '../util/createHash';
import { safeJsonStringify } from '../util/json';

import type {
  ApiProvider,
  CallApiContextParams,
  ProviderClassificationResponse,
  ProviderEmbeddingResponse,
  ProviderOptions,
  ProviderResponse,
} from '../types/providers';

const execAsync = util.promisify(exec);

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
    // Note: parsePathOrGlob is now async, so we'll need to handle it later
    this.scriptPath = runPath;
    this.functionName = null;
    this.id = () => options?.id ?? `golang:${this.scriptPath}:${this.functionName || 'default'}`;
    this.label = options?.label;
    this.config = options?.config ?? {};
    this.isInitialized = false;
  }

  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  private async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = (async () => {
      const { filePath: providerPath, functionName } = await parsePathOrGlob(
        this.options?.config.basePath || '',
        this.scriptPath,
      );
      this.scriptPath = path.relative(this.options?.config.basePath || '', providerPath);
      this.functionName = functionName || null;
      this.isInitialized = true;
    })();
    
    return this.initPromise;
  }

  id() {
    return this.options?.id ?? `golang:${this.scriptPath}:${this.functionName || 'default'}`;
  }

  private async findModuleRoot(startPath: string): Promise<string> {
    let currentPath = startPath;
    while (currentPath !== path.dirname(currentPath)) {
      try {
        await fs.access(path.join(currentPath, 'go.mod'));
        return currentPath;
      } catch {
        // File doesn't exist, continue searching
      }
      currentPath = path.dirname(currentPath);
    }
    throw new Error('Could not find go.mod file in any parent directory');
  }

  private async executeGolangScript(
    prompt: string,
    context: CallApiContextParams | undefined,
    apiType: 'call_api' | 'call_embedding_api' | 'call_classification_api',
  ): Promise<any> {
    await this.initialize();
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
      return JSON.parse(cachedResult);
    } else {
      if (context) {
        // These are not useful in Golang
        delete context.getCache;
        delete context.logger;
      }

      const args =
        apiType === 'call_api' ? [prompt, this.options, context] : [prompt, this.options];
      logger.debug(
        `Running Golang script ${absPath} with scriptPath ${this.scriptPath} and args: ${safeJsonStringify(args)}`,
      );
      const functionName = this.functionName || apiType;

      let tempDir: string | undefined;
      try {
        // Create temp directory
        tempDir = mkdtempSync(path.join(os.tmpdir(), 'golang-provider-'));

        // Helper function to copy directory recursively
        const copyDir = async (src: string, dest: string) => {
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

        // Copy wrapper.go to the same directory as the script
        const tempWrapperPath = path.join(scriptDir, 'wrapper.go');
        await fs.mkdir(scriptDir, { recursive: true });
        await fs.copyFile(path.join(__dirname, '../golang/wrapper.go'), tempWrapperPath);

        const executablePath = path.join(tempDir, 'golang_wrapper');
        const tempScriptPath = path.join(tempDir, relativeScriptPath);

        // Build from the script directory
        const compileCommand = `cd ${scriptDir} && ${this.config.goExecutable || 'go'} build -o ${executablePath} wrapper.go ${path.basename(relativeScriptPath)}`;

        await execAsync(compileCommand);

        const jsonArgs = safeJsonStringify(args) || '[]';
        // Escape single quotes in the JSON string
        const escapedJsonArgs = jsonArgs.replace(/'/g, "'\\''");
        const command = `${executablePath} ${tempScriptPath} ${functionName} '${escapedJsonArgs}'`;
        logger.debug(`Running command: ${command}`);

        const { stdout, stderr } = await execAsync(command);
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
          fs.rmSync(tempDir, { recursive: true, force: true });
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
