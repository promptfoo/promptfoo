import fs from 'fs';
import { globSync } from 'glob';
import yaml from 'js-yaml';
import * as path from 'path';

import logger from '../../logger';

/**
 * Extracts envPath from config files before full config loading.
 * This allows environment variables to be loaded early in the evaluation process.
 * 
 * @param configPaths - Array of config file paths or single config path
 * @returns The first envPath found in commandLineOptions, or undefined if none found
 */
export function extractEnvPathFromConfigs(configPaths: string | string[] | undefined): string | undefined {
  if (!configPaths) {
    return undefined;
  }

  try {
    const paths = Array.isArray(configPaths) ? configPaths : [configPaths];
    
    for (const configPath of paths) {
      const resolvedPath = path.resolve(process.cwd(), configPath);
      const globPaths = globSync(resolvedPath, {
        windowsPathsNoEscape: true,
      });

      for (const globPath of globPaths) {
        try {
          const rawConfig = yaml.load(fs.readFileSync(globPath, 'utf-8')) as any;
          if (rawConfig?.commandLineOptions?.envPath) {
            const envPath = rawConfig.commandLineOptions.envPath;
            logger.debug(`Using envPath from config: ${envPath}`);
            return envPath;
          }
        } catch (_fileError) {
          // Skip individual file errors silently during pre-parsing
          continue;
        }
      }
    }
  } catch (error) {
    logger.debug(`Failed to pre-extract envPath from config: ${(error as Error).message}`);
  }

  return undefined;
}