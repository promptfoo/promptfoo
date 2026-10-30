import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { loadSiteConfig } from '@docusaurus/core/lib/server/config';
import { afterEach, expect, it } from 'vitest';
import type { LoadContext } from '@docusaurus/types';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => fs.rm(directory, { recursive: true })),
  );
});

it('excludes root and nested agent guidance from llms-full.txt while retaining Markdown docs', async () => {
  const siteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llms-txt-'));
  directories.push(siteDir);
  const publicDocs = {
    'guide.md': '# Public Markdown guide',
    'overview.mdx': '# Public MDX overview',
    'nested/tutorial.md': '# Nested Markdown tutorial',
    'nested/component.mdx': '# Nested MDX component',
  };
  const files = {
    ...publicDocs,
    'AGENTS.md': 'Internal root agent instructions',
    'CLAUDE.md': 'Internal root Claude instructions',
    'nested/AGENTS.md': 'Internal nested agent instructions',
    'nested/CLAUDE.md': 'Internal nested Claude instructions',
    'nested/data.json': '{"internal":true}',
  };
  for (const [file, content] of Object.entries(files)) {
    const fullPath = path.join(siteDir, 'docs', file);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);
  }
  const outDir = path.join(siteDir, 'build');
  await fs.mkdir(outDir);

  const { siteConfig } = await loadSiteConfig({ siteDir: path.resolve(__dirname, '../..') });
  const pluginFactory = siteConfig.plugins.find(
    (plugin) => typeof plugin === 'function' && plugin.name === 'llmsTxtPlugin',
  );
  if (typeof pluginFactory !== 'function') {
    throw new Error('llmsTxtPlugin must be registered in the site config');
  }
  const plugin = await pluginFactory({ siteDir, siteConfig } as LoadContext, {});
  const content = await plugin.loadContent!();
  await plugin.postBuild!({
    content,
    routesPaths: ['/docs/guide/'],
    outDir,
  } as Parameters<NonNullable<typeof plugin.postBuild>>[0]);

  const output = await fs.readFile(path.join(outDir, 'llms-full.txt'), 'utf8');
  expect(output.split('\n\n---\n\n').sort()).toEqual(Object.values(publicDocs).sort());
});
