import { exec } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, copyFileSync, rmSync } from 'node:fs';
import os from 'os';
import path from 'path';
import util from 'util';
import { getCache, isCacheEnabled } from '../cache';
import logger from '../logger';
import type {
  ApiProvider,
  CallApiContextParams,
  ProviderClassificationResponse,
  ProviderEmbeddingResponse,
  ProviderOptions,
  ProviderResponse,
} from '../types/providers';
import { parsePathOrGlob } from '../util';
import { sha256 } from '../util/createHash';
import { safeJsonStringify } from '../util/json';

const execAsync = util.promisify(exec);

interface GolangProviderConfig {
  goExecutable?: string;
}

export class GolangProvider implements ApiProvider {
  config: GolangProviderConfig;

  private scriptPath: string = '';
  private functionName: string | null = null;
  public label: string | undefined;
  private runPath: string;
  private initialized = false;

  constructor(
    runPath: string,
    private options?: ProviderOptions,
  ) {
    this.runPath = runPath;
    this.label = options?.label;
    this.config = options?.config ?? {};
  }

  private async initialize() {
    if (this.initialized) return;
    
    const { filePath: providerPath, functionName } = await parsePathOrGlob(
      this.options?.config.basePath || '',
      this.runPath,
    );
    this.scriptPath = path.relative(this.options?.config.basePath || '', providerPath);
    this.functionName = functionName || null;
    this.initialized = true;
  }

  id() {
    return this.options?.id ?? `golang:${this.scriptPath || this.runPath}:${this.functionName || 'default'}`;
  }

  private findModuleRoot(startPath: string): string {
    let currentPath = startPath;
    while (currentPath !== path.dirname(currentPath)) {
      if (existsSync(path.join(currentPath, 'go.mod'))) {
        return currentPath;
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
    const moduleRoot = this.findModuleRoot(path.dirname(absPath));
    logger.debug(`Found module root at ${moduleRoot}`);
    logger.debug(`Computing file hash for script ${absPath}`);
    const fileHash = sha256(readFileSync(absPath, 'utf-8'));
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
        const copyDir = (src: string, dest: string) => {
          mkdirSync(dest, { recursive: true });
          const entries = readdirSync(src, { withFileTypes: true });
          for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) {
              copyDir(srcPath, destPath);
            } else {
              copyFileSync(srcPath, destPath);
            }
          }
        };

        // Copy the entire module structure
        copyDir(moduleRoot, tempDir);

        const relativeScriptPath = path.relative(moduleRoot, absPath);
        const scriptDir = path.dirname(path.join(tempDir, relativeScriptPath));

        // Copy wrapper.go to the same directory as the script
        const tempWrapperPath = path.join(scriptDir, 'wrapper.go');
        mkdirSync(scriptDir, { recursive: true });
        copyFileSync(path.join(__dirname, '../golang/wrapper.go'), tempWrapperPath);

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
            rmSync(tempDir, { recursive: true, force: true });
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
