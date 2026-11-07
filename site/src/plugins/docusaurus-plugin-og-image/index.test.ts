import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const createPlugin = require('./index.js') as typeof import('./index.js');
const sharp = require('sharp') as typeof import('sharp');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it('keeps special-page footers and event badges visible inside the generated images', async ({
  onTestFinished,
}) => {
  vi.stubEnv('SKIP_OG_GENERATION', 'false');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-og-layout-'));
  onTestFinished(() => fs.rm(outDir, { recursive: true, force: true }));

  await createPlugin().postBuild({
    siteConfig: { url: 'https://example.test' },
    routesPaths: [],
    outDir,
  });

  for (const page of ['pricing', 'about', 'contact', 'press', 'events']) {
    const image = sharp(path.join(outDir, 'img', 'og', `${page}-og.png`));
    expect(await image.metadata()).toMatchObject({ width: 1200, height: 630 });

    // The light footer text and pink badges both have a bright red channel.
    const red = await image
      .extract({ left: 40, top: 500, width: 1000, height: 110 })
      .extractChannel('red')
      .raw()
      .toBuffer();
    expect.soft(red.filter((value) => value > 200).length, page).toBeGreaterThan(100);
  }
});
