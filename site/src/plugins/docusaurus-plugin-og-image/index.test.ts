import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';
import type { Plugin } from '@docusaurus/types';

const require = createRequire(import.meta.url);
const createPlugin = require('./index.js') as () => Plugin;
const sharp = require('sharp') as typeof import('sharp');
const directories: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await Promise.all(
    directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

it('keeps special-page footers and event badges visible inside the generated images', async () => {
  vi.stubEnv('SKIP_OG_GENERATION', 'false');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-og-layout-'));
  directories.push(outDir);

  const plugin = createPlugin();
  await plugin.postBuild!({
    siteConfig: { url: 'https://example.test' },
    routesPaths: [],
    outDir,
  } as Parameters<NonNullable<typeof plugin.postBuild>>[0]);

  for (const page of ['pricing', 'about', 'contact', 'press', 'events']) {
    const image = sharp(path.join(outDir, 'img', 'og', `${page}-og.png`));
    expect(await image.metadata()).toMatchObject({ width: 1200, height: 630 });

    // The lower band contains the company trust text or the pink event badges.
    // Count their foreground pixels so a successfully generated but clipped image fails.
    const { data, info } = await image
      .extract({ left: 40, top: 500, width: 1000, height: 110 })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let foregroundPixels = 0;
    for (let offset = 0; offset < data.length; offset += info.channels) {
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const isForeground =
        page === 'events'
          ? red > 200 && red > green * 1.3 && red > blue * 1.3
          : red > 180 && green > 180 && blue > 180;
      if (isForeground) {
        foregroundPixels++;
      }
    }
    expect.soft(foregroundPixels, `${page} footer should remain visible`).toBeGreaterThan(100);
  }
});
