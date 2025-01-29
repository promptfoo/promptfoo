import { exec } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import util from 'util';
import { getCache, isCacheEnabled } from '../cache';
import logger from '../logger';
import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
  ProviderEmbeddingResponse,
  ProviderClassificationResponse,
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

  private async executeGolangScript(
    prompt: string,
    context: CallApiContextParams | undefined,
    apiType: 'call_api' | 'call_embedding_api' | 'call_classification_api',
  ): Promise<any> {
    const absPath = path.resolve(path.join(this.options?.config.basePath || '', this.scriptPath));
    const moduleRoot = path.dirname(absPath); // Assuming the go.mod is in the same directory as the script
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
      return JSON.parse(cachedResult);
    } else {
      if (context) {
        // These are not useful in Golang
        delete context.fetchWithCache;
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
        // Create temp directory with same structure as original
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'golang-provider-'));

        // Recreate the module structure
        const relativeToModule = path.relative(moduleRoot, absPath);
        const tempScriptDir = path.dirname(path.join(tempDir, relativeToModule));
        fs.mkdirSync(tempScriptDir, { recursive: true });

        // Copy module files
        const moduleFiles = ['go.mod', 'go.sum'];
        for (const file of moduleFiles) {
          const sourcePath = path.join(moduleRoot, file);
          if (fs.existsSync(sourcePath)) {
            fs.copyFileSync(sourcePath, path.join(tempDir, file));
          }
        }

        // Copy the entire internal directory if it exists
        const internalDir = path.join(moduleRoot, 'internal');
        if (fs.existsSync(internalDir)) {
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
          copyDir(internalDir, path.join(tempDir, 'internal'));
        }

        const tempWrapperPath = path.join(tempDir, 'wrapper.go');
        const tempScriptPath = path.join(tempDir, relativeToModule);
        const executablePath = path.join(tempDir, 'golang_wrapper');

        fs.copyFileSync(path.join(__dirname, '../golang/wrapper.go'), tempWrapperPath);
        fs.copyFileSync(absPath, tempScriptPath);

        if (!fs.existsSync(executablePath)) {
          // Build from the module root to preserve import context
          const compileCommand = `cd ${tempDir} && ${this.config.goExecutable || 'go'} build -o ${executablePath} ${path.relative(tempDir, tempWrapperPath)} ${path.relative(tempDir, tempScriptPath)}`;
          await execAsync(compileCommand);
        }

        // Run the compiled binary
        const command = `${executablePath} ${tempScriptPath} ${functionName} '${safeJsonStringify(args)}'`;
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
