import chalk from 'chalk';
import fs from 'fs';
import get from 'lodash.get';
import path from 'path';
import { importModule } from '../esm';
import logger from '../logger';
import type { ApiProvider, ProviderOptions } from '../types';
import dedent from 'dedent';

export async function parsePackageProvider(
  providerPath: string,
  basePath: string,
  options: ProviderOptions,
): Promise<ApiProvider> {
  const [, packageName, providerName] = providerPath.split(':');

  if (!packageName || !providerName) {
    throw new Error(
      `Invalid package provider format: ${providerPath}. Expected format: package:packageName:providerName`,
    );
  }

  const modulePath = path.join(basePath, 'node_modules', packageName);
  const pkgPath = path.join(modulePath, 'package.json');

  if (!fs.existsSync(pkgPath)) {
    throw new Error(`Package not found: ${packageName}. Make sure it's installed in ${basePath}`);
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
    name: string;
    main?: string;
  };

  if (!pkg.main) {
    logger.error(dedent`
      Could not determine main entry in package.json: ${chalk.bold(pkgPath)}.

      ${chalk.white(dedent`Please check your package.json and ensure the property 'main' is correctly specified.`)}
    `);
    process.exit(1);
  }

  const module = await importModule(path.join(modulePath, pkg.main));
  const Provider = get(module, providerName);

  if (!Provider) {
    logger.error(dedent`
      Could not find provider: ${chalk.bold(providerName)} in module: ${chalk.bold(modulePath)}.
    `);
    process.exit(1);
  }

  return new Provider(options);
}
