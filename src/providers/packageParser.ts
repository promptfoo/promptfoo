import path from 'path';

import { importModule, resolvePackageEntryPoint } from '../esm';

import type { ApiProvider, ProviderOptions } from '../types/index';

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

  // Resolve the package path using exsolve-based resolver
  // This handles ESM-only packages with restrictive exports fields
  const filePath = resolvePackageEntryPoint(packageName, path.resolve(basePath));
  if (!filePath) {
    throw new Error(`Package not found: ${packageName}. Make sure it's installed in ${basePath}`);
  }

  // Then, try to import the module
  let module;
  try {
    module = await importModule(filePath);
  } catch (error) {
    throw new Error(`Failed to import module: ${packageName}. Error: ${error}`);
  }

  const entity = getValue(module, entityName ?? 'default');

  if (!entity) {
    throw new Error(
      `Could not find entity: ${entityName} in module: ${filePath}. ` +
        `Make sure the entity is exported from the package.`,
    );
  }

  return entity;
}

export async function parsePackageProvider(
  providerPath: string,
  basePath: string,
  options: ProviderOptions,
): Promise<ApiProvider> {
  const Provider = await loadFromPackage(providerPath, basePath);

  return new Provider(options);
}
