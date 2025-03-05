import dotenv from 'dotenv';
import deepEqual from 'fast-deep-equal';
import { globSync } from 'glob';
import * as path from 'path';
import { TERMINAL_MAX_WIDTH } from '../constants';
import { getEnvBool } from '../envars';
import { importModule } from '../esm';
import logger from '../logger';
import {
  type EvaluateResult,
  type NunjucksFilterMap,
  type TestCase,
  type CompletedPrompt,
  isApiProvider,
  isProviderOptions,
} from '../types';
import type { Vars } from '../types';
import { getNunjucksEngine } from './templates';

export async function readFilters(
  filters: Record<string, string>,
  basePath: string = '',
): Promise<NunjucksFilterMap> {
  const ret: NunjucksFilterMap = {};

  for (const [name, filterPath] of Object.entries(filters)) {
    const globPath = path.join(basePath, filterPath);

    try {
      // Check if globSync returns anything
      const filePaths = globSync(globPath, {
        windowsPathsNoEscape: true,
      });

      // If we have matching files, process them
      if (filePaths && filePaths.length > 0) {
        // Make sure filePaths is an array
        const filePathsArray = Array.isArray(filePaths) ? filePaths : [filePaths];
        for (const filePath of filePathsArray) {
          const finalPath = path.resolve(filePath);
          ret[name] = await importModule(finalPath);
        }
      } else {
        // No glob matches, try direct import with the original path
        // This is particularly helpful for tests
        ret[name] = await importModule(path.resolve(globPath));
      }
    } catch (error) {
      logger.debug(`Error loading filter ${name} from ${globPath}: ${error}`);
      // Try direct import as a fallback
      try {
        ret[name] = await importModule(path.resolve(globPath));
      } catch (innerError) {
        logger.error(`Failed to import filter ${name}: ${innerError}`);
      }
    }
  }

  return ret;
}

export function printBorder() {
  const border = '='.repeat(TERMINAL_MAX_WIDTH);
  logger.info(border);
}

export function setupEnv(envPath: string | undefined) {
  if (envPath) {
    logger.info(`Loading environment variables from ${envPath}`);
    dotenv.config({ path: envPath });
  } else {
    dotenv.config();
  }
}

export type StandaloneEval = CompletedPrompt & {
  evalId: string;
  description: string | null;
  datasetId: string | null;
  promptId: string | null;
  isRedteam: boolean;
  createdAt: number;

  pluginFailCount: Record<string, number>;
  pluginPassCount: Record<string, number>;
};

export function providerToIdentifier(provider: TestCase['provider']): string | undefined {
  if (isApiProvider(provider)) {
    return provider.id();
  } else if (isProviderOptions(provider)) {
    return provider.id;
  } else if (typeof provider === 'string') {
    return provider;
  }
  return undefined;
}

export function varsMatch(vars1: Vars | undefined, vars2: Vars | undefined) {
  return deepEqual(vars1, vars2);
}

export function resultIsForTestCase(result: EvaluateResult, testCase: TestCase): boolean {
  const providersMatch = testCase.provider
    ? providerToIdentifier(testCase.provider) === providerToIdentifier(result.provider)
    : true;

  return varsMatch(testCase.vars, result.vars) && providersMatch;
}

export function renderVarsInObject<T>(obj: T, vars?: Record<string, string | object>): T {
  // Renders nunjucks template strings with context variables
  if (!vars || getEnvBool('PROMPTFOO_DISABLE_TEMPLATING')) {
    return obj;
  }
  if (typeof obj === 'string') {
    return getNunjucksEngine().renderString(obj, vars) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => renderVarsInObject(item, vars)) as unknown as T;
  }
  if (typeof obj === 'object' && obj !== null) {
    const result: Record<string, unknown> = {};
    for (const key in obj) {
      result[key] = renderVarsInObject((obj as Record<string, unknown>)[key], vars);
    }
    return result as T;
  } else if (typeof obj === 'function') {
    const fn = obj as Function;
    const returnValue = fn({ vars });
    return renderVarsInObject(returnValue as unknown as T, vars);
  }
  return obj;
}

export function isRunningUnderNpx(): boolean {
  return Boolean(
    process.env.npm_execpath?.includes('npx') ||
      process.execPath.includes('npx') ||
      process.env.npm_lifecycle_script?.includes('npx'),
  );
}
