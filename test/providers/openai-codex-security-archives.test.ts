import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { extractPluginZip } from '@openai/codex-security';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Stored ZIP fixtures contain a minimal .codex-plugin/plugin.json and README.
// Symlink fixtures point escaped.txt outside the destination; the duplicate
// fixture then writes a regular file with that same name. The traversal ZIP
// directly writes ../outside/escaped.txt.
const archives = {
  valid:
    'UEsDBBQAAAAAAAAAIVC1YlygKwAAACsAAAAZAAAALmNvZGV4LXBsdWdpbi9wbHVnaW4uanNvbnsibmFtZSI6ImNvZGV4LXNlY3VyaXR5IiwidmVyc2lvbiI6IjEuMC4wIn1QSwMEFAAAAAAAAAAhUDJUN7IOAAAADgAAAAkAAABSRUFETUUubWRwbHVnaW4gZml4dHVyZVBLAQIUAxQAAAAAAAAAIVC1YlygKwAAACsAAAAZAAAAAAAAAAAAAACAgQAAAAAuY29kZXgtcGx1Z2luL3BsdWdpbi5qc29uUEsBAhQDFAAAAAAAAAAhUDJUN7IOAAAADgAAAAkAAAAAAAAAAAAAAICBYgAAAFJFQURNRS5tZFBLBQYAAAAAAgACAH4AAACXAAAAAAA=',
  symlink:
    'UEsDBBQAAAAAAAAAIVAh5p3LFgAAABYAAAALAAAAZXNjYXBlZC50eHQuLi9vdXRzaWRlL2VzY2FwZWQudHh0UEsDBBQAAAAAAAAAIVC1YlygKwAAACsAAAAZAAAALmNvZGV4LXBsdWdpbi9wbHVnaW4uanNvbnsibmFtZSI6ImNvZGV4LXNlY3VyaXR5IiwidmVyc2lvbiI6IjEuMC4wIn1QSwMEFAAAAAAAAAAhUDJUN7IOAAAADgAAAAkAAABSRUFETUUubWRwbHVnaW4gZml4dHVyZVBLAQIUAxQAAAAAAAAAIVAh5p3LFgAAABYAAAALAAAAAAAAAAAAAAD/oQAAAABlc2NhcGVkLnR4dFBLAQIUAxQAAAAAAAAAIVC1YlygKwAAACsAAAAZAAAAAAAAAAAAAACAgT8AAAAuY29kZXgtcGx1Z2luL3BsdWdpbi5qc29uUEsBAhQDFAAAAAAAAAAhUDJUN7IOAAAADgAAAAkAAAAAAAAAAAAAAICBoQAAAFJFQURNRS5tZFBLBQYAAAAAAwADALcAAADWAAAAAAA=',
  duplicateSymlink:
    'UEsDBBQAAAAAAAAAIVAh5p3LFgAAABYAAAALAAAAZXNjYXBlZC50eHQuLi9vdXRzaWRlL2VzY2FwZWQudHh0UEsDBBQAAAAAAAAAIVC1YlygKwAAACsAAAAZAAAALmNvZGV4LXBsdWdpbi9wbHVnaW4uanNvbnsibmFtZSI6ImNvZGV4LXNlY3VyaXR5IiwidmVyc2lvbiI6IjEuMC4wIn1QSwMEFAAAAAAAAAAhUDJUN7IOAAAADgAAAAkAAABSRUFETUUubWRwbHVnaW4gZml4dHVyZVBLAwQUAAAAAAAAACFQjrDoJQYAAAAGAAAACwAAAGVzY2FwZWQudHh0ZXNjYXBlUEsBAhQDFAAAAAAAAAAhUCHmncsWAAAAFgAAAAsAAAAAAAAAAAAAAP+hAAAAAGVzY2FwZWQudHh0UEsBAhQDFAAAAAAAAAAhULViXKArAAAAKwAAABkAAAAAAAAAAAAAAICBPwAAAC5jb2RleC1wbHVnaW4vcGx1Z2luLmpzb25QSwECFAMUAAAAAAAAACFQMlQ3sg4AAAAOAAAACQAAAAAAAAAAAAAAgIGhAAAAUkVBRE1FLm1kUEsBAhQDFAAAAAAAAAAhUI6w6CUGAAAABgAAAAsAAAAAAAAAAAAAAICB1gAAAGVzY2FwZWQudHh0UEsFBgAAAAAEAAQA8AAAAAUBAAAAAA==',
  traversal:
    'UEsDBBQAAAAAAAAAIVCOsOglBgAAAAYAAAAWAAAALi4vb3V0c2lkZS9lc2NhcGVkLnR4dGVzY2FwZVBLAwQUAAAAAAAAACFQtWJcoCsAAAArAAAAGQAAAC5jb2RleC1wbHVnaW4vcGx1Z2luLmpzb257Im5hbWUiOiJjb2RleC1zZWN1cml0eSIsInZlcnNpb24iOiIxLjAuMCJ9UEsDBBQAAAAAAAAAIVAyVDeyDgAAAA4AAAAJAAAAUkVBRE1FLm1kcGx1Z2luIGZpeHR1cmVQSwECFAMUAAAAAAAAACFQjrDoJQYAAAAGAAAAFgAAAAAAAAAAAAAAgIEAAAAALi4vb3V0c2lkZS9lc2NhcGVkLnR4dFBLAQIUAxQAAAAAAAAAIVC1YlygKwAAACsAAAAZAAAAAAAAAAAAAACAgToAAAAuY29kZXgtcGx1Z2luL3BsdWdpbi5qc29uUEsBAhQDFAAAAAAAAAAhUDJUN7IOAAAADgAAAAkAAAAAAAAAAAAAAICBnAAAAFJFQURNRS5tZFBLBQYAAAAAAwADAMIAAADRAAAAAAA=',
};

describe('Codex Security plugin archives', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'promptfoo-plugin-archive-'));
    await mkdir(path.join(directory, 'outside'));
    await writeFile(path.join(directory, 'outside', 'escaped.txt'), 'unchanged');
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  async function extract(archive: keyof typeof archives) {
    const zipPath = path.join(directory, 'plugin.zip');
    await writeFile(zipPath, Buffer.from(archives[archive], 'base64'));
    return extractPluginZip(zipPath, path.join(directory, 'installed'));
  }

  it('extracts a regular plugin archive', async () => {
    const pluginPath = await extract('valid');
    expect(await readFile(path.join(pluginPath, 'README.md'), 'utf8')).toBe('plugin fixture');
    expect(
      JSON.parse(await readFile(path.join(pluginPath, '.codex-plugin/plugin.json'), 'utf8')),
    ).toEqual({ name: 'codex-security', version: '1.0.0' });
  });

  it.each(['symlink', 'duplicateSymlink', 'traversal'] as const)(
    'rejects %s archives without writing outside the extraction directory',
    async (kind) => {
      await expect(extract(kind)).rejects.toThrow();
      expect(await readFile(path.join(directory, 'outside', 'escaped.txt'), 'utf8')).toBe(
        'unchanged',
      );
      expect((await readdir(directory)).sort()).toEqual(['outside', 'plugin.zip']);
    },
  );
});
