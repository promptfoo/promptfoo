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
        // Create temp directory
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'golang-provider-'));
        logger.debug(`Created temp directory: ${tempDir}`);

        // Create provider subdirectory
        const providerDir = path.join(tempDir, 'provider');
        fs.mkdirSync(providerDir, { recursive: true });
        logger.debug(`Created provider subdirectory: ${providerDir}`);

        // Copy provider.go to provider subdirectory
        const tempProviderPath = path.join(providerDir, 'provider.go');
        fs.copyFileSync(absPath, tempProviderPath);
        logger.debug(`Copied provider.go to: ${tempProviderPath}`);

        // Copy wrapper.go to root directory
        const tempWrapperPath = path.join(tempDir, 'wrapper.go');
        fs.copyFileSync(path.join(__dirname, '../golang/wrapper.go'), tempWrapperPath);
        logger.debug(`Copied wrapper.go to: ${tempWrapperPath}`);

        // Try to copy existing go.mod and go.sum first
        const originalGoMod = path.join(moduleRoot, 'go.mod');
        const originalGoSum = path.join(moduleRoot, 'go.sum');

        if (fs.existsSync(originalGoMod)) {
          logger.debug(`Found existing go.mod at ${originalGoMod}, copying it`);
          fs.copyFileSync(originalGoMod, path.join(tempDir, 'go.mod'));

          // Update module name in go.mod
          let goModContent = fs.readFileSync(path.join(tempDir, 'go.mod'), 'utf8');
          goModContent = goModContent.replace(/module\s+[^\n]+/, 'module tempmod');
          fs.writeFileSync(path.join(tempDir, 'go.mod'), goModContent);

          if (fs.existsSync(originalGoSum)) {
            logger.debug(`Found existing go.sum at ${originalGoSum}, copying it`);
            fs.copyFileSync(originalGoSum, path.join(tempDir, 'go.sum'));
          }
        } else {
          // Create new go.mod if none exists
          logger.debug('Creating new go.mod file');
          const goModContent = `module tempmod

go 1.21

require github.com/sashabaranov/go-openai v1.17.9
`;
          fs.writeFileSync(path.join(tempDir, 'go.mod'), goModContent);
        }

        // Run go mod tidy to ensure all dependencies are properly set up
        logger.debug('Running go mod tidy to set up dependencies');
        await execAsync(`cd ${tempDir} && ${this.config.goExecutable || 'go'} mod tidy`);

        const executablePath = path.join(tempDir, 'golang_wrapper');

        if (!fs.existsSync(executablePath)) {
          // Build from the module root
          const compileCommand = `cd ${tempDir} && ${this.config.goExecutable || 'go'} build -o ${executablePath} .`;
          logger.debug(`Running build command: ${compileCommand}`);
          await execAsync(compileCommand);
        }

        const jsonArgs = safeJsonStringify(args) || '[]';
        // Escape single quotes in the JSON string
        const escapedJsonArgs = jsonArgs.replace(/'/g, "'\\''");
        const command = `${executablePath} provider.go ${functionName} '${escapedJsonArgs}'`;
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
