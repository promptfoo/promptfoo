import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Rolldown } from 'tsdown';
import webpack from 'webpack';

/** Exercise a library module after both our build and a consumer's Webpack build. */
export async function withWebpackBundle<T>(
  source: URL,
  check: (exports: T) => Promise<void>,
): Promise<void> {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  // Keep the fixture below node_modules so runtime optional peers resolve from this install.
  const directory = fs.mkdtempSync(path.join(root, 'node_modules', '.promptfoo-webpack-'));
  try {
    const library = await Rolldown.rolldown({
      input: fileURLToPath(source),
      external: (id) => /^[a-z@]/i.test(id),
    });
    const entry = path.join(directory, 'library.mjs');
    try {
      const { output } = await library.generate({ format: 'esm' });
      fs.writeFileSync(entry, output[0].code);
    } finally {
      await library.close();
    }
    const compiler = webpack({
      mode: 'development',
      context: directory,
      entry,
      target: 'node',
      externals: /^[a-z@]/i,
      devtool: false,
      output: { path: directory, filename: 'consumer.cjs', library: { type: 'commonjs2' } },
    });
    if (!compiler) {
      throw new Error('Webpack did not create a compiler');
    }
    await new Promise<void>((resolve, reject) => {
      compiler.run((error, stats) => {
        compiler.close((closeError) => {
          if (error || closeError) {
            reject(error || closeError);
          } else if (!stats || stats.hasErrors()) {
            reject(new Error(stats?.toString({ all: false, errors: true }) ?? 'No Webpack stats'));
          } else {
            resolve();
          }
        });
      });
    });
    const require = createRequire(import.meta.url);
    await check(require(path.join(directory, 'consumer.cjs')) as T);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
