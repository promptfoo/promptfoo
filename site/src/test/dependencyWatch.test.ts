import { EventEmitter, once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { DEFAULT_OPTIONS } from '@docusaurus/plugin-content-docs/lib/options';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const requireFromDocusaurus = createRequire(require.resolve('@docusaurus/core/package.json'));

it('watches nested Markdown files using the docs plugin include patterns', async () => {
  const siteDir = await mkdtemp(path.join(os.tmpdir(), 'promptfoo-docs-watch-'));
  let watcher: (EventEmitter & { close(): Promise<void> }) | undefined;
  try {
    await mkdir(path.join(siteDir, 'docs', 'guide'), { recursive: true });
    await Promise.all([
      writeFile(path.join(siteDir, 'docs', 'intro.md'), '# Introduction'),
      writeFile(path.join(siteDir, 'docs', 'guide', 'start.mdx'), '# Getting started'),
      writeFile(path.join(siteDir, 'docs', 'guide', 'notes.txt'), 'Not a page'),
    ]);
    // Resolve the watcher through its consumer, rather than the CLI's separate watcher.
    watcher = requireFromDocusaurus('chokidar').watch(
      DEFAULT_OPTIONS.include.map((pattern) => `docs/${pattern}`),
      { cwd: siteDir },
    ) as EventEmitter & { close(): Promise<void> };
    const pages: string[] = [];
    watcher.on('add', (file: string) => pages.push(file.split(path.sep).join('/')));
    await once(watcher, 'ready');

    expect(pages.sort()).toEqual(['docs/guide/start.mdx', 'docs/intro.md']);
  } finally {
    await watcher?.close();
    await rm(siteDir, { recursive: true, force: true });
  }
});
