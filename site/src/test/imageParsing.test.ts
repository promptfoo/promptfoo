import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

// Exercise the parser resolved by the docs build, including nested installations.
const require = createRequire(import.meta.url);
const requireFromDocusaurus = createRequire(require.resolve('@docusaurus/core/package.json'));
const requireFromMdx = createRequire(requireFromDocusaurus.resolve('@docusaurus/mdx-loader'));
const imageSizePath = requireFromMdx.resolve('image-size');

function parseImage(input: Buffer) {
  // A regressed parser can loop forever on these inputs. Isolate it so the test
  // fails with a bounded child lifetime instead of hanging the Vitest worker.
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `const { readFileSync } = require('node:fs');
       const { imageSize } = require(process.argv[1]);
       try {
         process.stdout.write(JSON.stringify({ size: imageSize(readFileSync(0)) }));
       } catch (error) {
         process.stdout.write(JSON.stringify({ error: error.message }));
       }`,
      imageSizePath,
    ],
    { input, encoding: 'utf8', timeout: 5_000 },
  );
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}

function box(name: string, payload: Buffer, size = payload.length + 8): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(size);
  header.write(name, 4, 'ascii');
  return Buffer.concat([header, payload]);
}

describe('documentation image dimensions', () => {
  it('reads ordinary PNG dimensions', () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000020806000000', 'hex');
    expect(parseImage(png)).toMatchObject({ size: { width: 1, height: 2, type: 'png' } });
  });

  it('rejects an ICNS image with a zero-length icon entry without looping', () => {
    const icns = Buffer.from('69636e73000000106963303700000000', 'hex');
    expect(parseImage(icns)).toEqual({ error: expect.any(String) });
  });

  it('rejects a HEIF image with a zero-length ispe box without looping', () => {
    const dimensions = Buffer.from('000000000000000100000001', 'hex');
    const ispe = box('ispe', dimensions, 0);
    const meta = box('meta', Buffer.concat([Buffer.alloc(4), box('iprp', box('ipco', ispe))]));
    const heif = Buffer.concat([box('ftyp', Buffer.from('heic')), meta]);
    expect(parseImage(heif)).toEqual({ error: expect.any(String) });
  });
});
