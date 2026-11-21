import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Rolldown } from 'tsdown';
import webpack from 'webpack';

/** Exercise a library module after both our build and a consumer's Webpack build. */
export async function withWebpackBundle<T>(
  source: URL,
  check: (exports: T) => Promise<void>,
  unavailablePackages: string[] = [],
): Promise<void> {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-webpack-'));
  const deployed = fs.mkdtempSync(path.join(root, 'node_modules', '.promptfoo-webpack-'));
  try {
    const library = await Rolldown.rolldown({
      input: fileURLToPath(source),
      external: (id) => !path.isAbsolute(id) && /^[a-z@]/i.test(id),
    });
    const entry = path.join(directory, 'library.mjs');
    try {
      const { output } = await library.generate({ format: 'esm' });
      fs.writeFileSync(entry, output[0].code);
    } finally {
      await library.close();
    }
    await new Promise<void>((resolve, reject) => {
      webpack(
        {
          mode: 'development',
          context: directory,
          entry,
          target: 'node',
          externals: [
            ({ request }, callback) => {
              if (request && unavailablePackages.includes(request)) {
                callback(new Error(`${request} is not installed in this consumer`));
              } else if (request && !path.isAbsolute(request) && /^[a-z@]/i.test(request)) {
                callback(null, `commonjs ${request}`);
              } else {
                callback();
              }
            },
          ],
          devtool: false,
          output: { path: directory, filename: 'consumer.cjs', library: { type: 'commonjs2' } },
        },
        (error, stats) => {
          if (error) {
            reject(error);
          } else if (!stats || stats.hasErrors()) {
            reject(new Error(stats?.toString({ all: false, errors: true }) ?? 'No Webpack stats'));
          } else {
            resolve();
          }
        },
      );
    });
    // Only the deployment has peers. Delete the build tree to catch
    // accidentally embedded build-time paths before exercising the bundle.
    const target = path.join(deployed, 'consumer.cjs');
    fs.copyFileSync(path.join(directory, 'consumer.cjs'), target);
    fs.rmSync(directory, { recursive: true, force: true });
    await check(createRequire(import.meta.url)(target) as T);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
    fs.rmSync(deployed, { recursive: true, force: true });
  }
}
