import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import util from 'util';

import { getCache, isCacheEnabled } from '../cache';
import { getWrapperDir } from '../esm';
import logger from '../logger';
import { sha256 } from '../util/createHash';
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

  private findModuleRoot(startPath: string): string {
    let currentPath = startPath;
    while (currentPath !== path.dirname(currentPath)) {
      if (fs.existsSync(path.join(currentPath, 'go.mod'))) {
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
    const absPath = path.resolve(path.join(this.options?.config.basePath || '', this.scriptPath));
    const moduleRoot = this.findModuleRoot(path.dirname(absPath));
    logger.debug(`Found module root at ${moduleRoot}`);
    logger.debug(`Computing file hash for script ${absPath}`);
    const fileHash = sha256(fs.readFileSync(absPath, 'utf-8'));
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
      const functionName = this.functionName || apiType;

      let tempDir: string | undefined;
      try {
        // Create temp directory
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'golang-provider-'));

        // Helper function to copy directory recursively
        const copyDir = (src: string, dest: string) => {
          fs.mkdirSync(dest, { recursive: true });
          const entries = fs.readdirSync(src, { withFileTypes: true });
          for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) {
              copyDir(srcPath, destPath);
            } else {
              fs.copyFileSync(srcPath, destPath);
            }
          }
        };

        // Copy the entire module structure
        copyDir(moduleRoot, tempDir);

        const relativeScriptPath = path.relative(moduleRoot, absPath);
        const scriptDir = path.dirname(path.join(tempDir, relativeScriptPath));

        // Copy wrapper.go to the same directory as the script
        const tempWrapperPath = path.join(scriptDir, 'wrapper.go');
        fs.mkdirSync(scriptDir, { recursive: true });
        fs.copyFileSync(path.join(getWrapperDir('golang'), 'wrapper.go'), tempWrapperPath);

        const executablePath = path.join(tempDir, 'golang_wrapper');
        const tempScriptPath = path.join(tempDir, relativeScriptPath);

        // Build from the script directory using execFile (no shell injection)
        const goExecutable = this.config.goExecutable || 'go';
        await execFileAsync(
          goExecutable,
          ['build', '-o', executablePath, 'wrapper.go', path.basename(relativeScriptPath)],
          { cwd: scriptDir },
        );

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
