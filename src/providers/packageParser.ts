import chalk from 'chalk';
import dedent from 'dedent';
import { createRequire } from 'node:module';
import path from 'path';
import { importModule } from '../esm';
import logger from '../logger';
import type { ApiProvider, ProviderOptions } from '../types';

function getValue<T extends object, K extends string>(obj: T, path: K): any {
  return path.split('.').reduce((acc: any, key: string) => {
    return acc && acc[key] !== undefined ? acc[key] : undefined;
  }, obj);
}

export function isPackagePath(path: any): path is string {
  return typeof path === 'string' && path.startsWith('package:');
}

export async function loadFromPackage(packageInstancePath: string, basePath: string): Promise<any> {
  const [, packageName, entityName] = packageInstancePath.split(':');

  if (!packageName || !entityName) {
    throw new Error(
      `Invalid package format: ${packageInstancePath}. Expected format: package:packageName:exportedClassOrFunction`,
    );
  }

  try {
    const require = createRequire(path.resolve(basePath));
    const filePath = require.resolve(packageName);
    const module = await importModule(filePath);
    const entity = getValue(module, entityName ?? 'default');

    if (!entity) {
      logger.error(dedent`
        Could not find entity: ${chalk.bold(entityName)} in module: ${chalk.bold(filePath)}.
      `);
      process.exit(1);
    }

    return entity;
  } catch {
    throw new Error(`Package not found: ${packageName}. Make sure it's installed in ${basePath}`);
  }
}

export async function parsePackageProvider(
  providerPath: string,
  basePath: string,
  options: ProviderOptions,
): Promise<ApiProvider> {
  const Provider = await loadFromPackage(providerPath, basePath);

  return new Provider(options);
}
