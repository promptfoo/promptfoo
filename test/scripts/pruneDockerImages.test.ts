import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';
import { type PackageVersion, planPrune } from '../../scripts/pruneDockerImages.mjs';

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'scripts',
  'pruneDockerImages.mjs',
);
const NOW = Date.parse('2026-10-12T00:00:00Z');
const OLD = '2026-08-01T00:00:00Z';
const RECENT = '2026-10-01T00:00:00Z';

let nextId = 1;
function digest(seed: string): string {
  return `sha256:${seed.repeat(64).slice(0, 64)}`;
}
function version(seed: string, tags: string[], updatedAt = OLD): PackageVersion {
  return {
    id: nextId++,
    name: digest(seed),
    created_at: updatedAt,
    updated_at: updatedAt,
    metadata: { container: { tags } },
  };
}
function attestationFor(subjectSeed: string, seed: string): PackageVersion {
  return version(seed, [`sha256-${digest(subjectSeed).slice('sha256:'.length)}`]);
}
function removedTags(versions: PackageVersion[], extraTags: string[] = []): string[][] {
  return planPrune(versions, { now: NOW, olderThanDays: 30, extraTags }).map(
    (removed) => removed.metadata?.container?.tags ?? [],
  );
}

describe('pruneDockerImages', () => {
  it('removes an old build that has only its commit tag', () => {
    expect(removedTags([version('a', ['sha-0123abc'])])).toEqual([['sha-0123abc']]);
  });

  it('keeps a build that is not old enough yet', () => {
    expect(removedTags([version('a', ['sha-0123abc'], RECENT)])).toEqual([]);
  });

  it.each([
    ['a release', ['sha-0123abc', '0.124.1']],
    ['a prerelease', ['sha-0123abc', '0.125.0-beta.1']],
    ['a minor alias', ['sha-0123abc', '0.124.1', '0.124']],
    ['main', ['main', 'sha-0123abc']],
    ['latest', ['sha-0123abc', '0.124.1', 'latest']],
    ['a branch build nobody named', ['fix-docker', 'sha-0123abc']],
  ])('keeps an image whose commit tag is shared with %s', (_label, tags) => {
    expect(removedTags([version('a', tags)])).toEqual([]);
  });

  it.each([
    ['a release', ['0.118.14']],
    ['a minor alias', ['0.118']],
    ['the live build cache', ['buildcache-linux-arm64']],
    ['a tag no rule knows', ['chore-publish-docker']],
    ['an untagged platform manifest', []],
  ])('keeps %s however old it is', (_label, tags) => {
    expect(removedTags([version('a', tags)])).toEqual([]);
  });

  it('removes the build cache of an old backfill', () => {
    expect(removedTags([version('a', ['buildcache-linux-amd64-0.120.10'])])).toEqual([
      ['buildcache-linux-amd64-0.120.10'],
    ]);
  });

  it('removes named tags only when nothing else shares the image', () => {
    const versions = [
      version('a', ['chore-publish-docker']),
      version('b', ['fix-docker', 'sha-0123abc']),
      version('c', ['fix-docker', '0.124.1']),
    ];

    expect(removedTags(versions, ['chore-publish-docker', 'fix-docker'])).toEqual([
      ['chore-publish-docker'],
      ['fix-docker', 'sha-0123abc'],
    ]);
  });

  it('removes an attestation with its image and keeps the others', () => {
    const versions = [
      version('a', ['sha-0123abc']),
      attestationFor('a', '1'),
      version('b', ['0.124.1', 'sha-4567def']),
      attestationFor('b', '2'),
      // Its image was removed in an earlier run.
      attestationFor('c', '3'),
    ];

    expect(removedTags(versions)).toEqual([
      ['sha-0123abc'],
      [`sha256-${'a'.repeat(64)}`],
      [`sha256-${'c'.repeat(64)}`],
    ]);
  });

  it('does not let a named attestation tag outlive or outrun its image', () => {
    const kept = attestationFor('b', '2');
    const removed = attestationFor('a', '1');
    const versions = [version('a', ['sha-0123abc']), removed, version('b', ['0.124.1']), kept];
    const named = [
      ...(kept.metadata?.container?.tags ?? []),
      ...(removed.metadata?.container?.tags ?? []),
    ];

    // Naming them changes nothing: one goes once, with its image, and the other stays.
    expect(removedTags(versions, named)).toEqual([['sha-0123abc'], [`sha256-${'a'.repeat(64)}`]]);
  });

  it.each([
    [['--org', 'promptfoo'], /--org and --package are required/],
    [
      ['--org', 'promptfoo', '--package', 'promptfoo', '--tags', 'fix-docker, latest'],
      /cannot name a protected tag: latest/,
    ],
    [
      ['--org', 'promptfoo', '--package', 'promptfoo', '--tags', '0.124.1'],
      /cannot name a protected tag: 0\.124\.1/,
    ],
    [
      ['--org', 'promptfoo', '--package', 'promptfoo', '--tags', 'buildcache-linux-amd64'],
      /cannot name a protected tag/,
    ],
    [
      ['--org', 'promptfoo', '--package', 'promptfoo', '--older-than-days', '0'],
      /must be a number of at least 1/,
    ],
    [['--org', 'promptfoo', '--package', 'promptfoo', '--tags', ''], /GITHUB_TOKEN is required/],
  ])('refuses to run with %j', (args, message) => {
    const result = spawnSync(process.execPath, [SCRIPT, ...args], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(message);
  });
  describe('against the packages API', () => {
    let server: http.Server | undefined;

    afterEach(async () => {
      await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
      server = undefined;
    });

    // 101 versions, so the listing takes two pages. Three are old commit-only builds,
    // and two of those have an attestation.
    const listed: PackageVersion[] = [
      { ...version('a', ['sha-0123abc']), id: 11 },
      { ...version('b', ['sha-4567def']), id: 12 },
      { ...version('c', ['sha-89abcde']), id: 13 },
      { ...version('d', ['0.124.1', 'sha-fedcba9']), id: 14 },
      { ...attestationFor('a', 'e'), id: 21 },
      { ...attestationFor('b', 'f'), id: 22 },
      ...Array.from({ length: 95 }, (_, index) => ({
        ...version(String(index % 10), []),
        id: 100 + index,
      })),
    ];

    async function run(args: string[], failingId?: number) {
      const requests: string[] = [];
      server = http.createServer((request, response) => {
        requests.push(`${request.method} ${request.url}`);
        const url = new URL(request.url ?? '', 'http://localhost');
        if (request.headers.authorization !== 'Bearer test-token') {
          response.writeHead(401).end('{}');
        } else if (request.method === 'GET') {
          const page = Number(url.searchParams.get('page'));
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify(listed.slice((page - 1) * 100, page * 100)));
        } else if (url.pathname.endsWith(`/versions/${failingId}`)) {
          response
            .writeHead(400)
            .end(
              '{"message":"Publicly visible package versions with more than 5000 downloads cannot be deleted."}',
            );
        } else {
          response.writeHead(204).end();
        }
      });
      await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
      const { port } = server.address() as { port: number };
      // Not spawnSync: that would block this process, which is serving the API.
      const child = spawn(
        process.execPath,
        [SCRIPT, '--org', 'promptfoo', '--package', 'promptfoo', ...args],
        {
          env: {
            PATH: process.env.PATH,
            GITHUB_TOKEN: 'test-token',
            GITHUB_API_URL: `http://127.0.0.1:${port}`,
          },
        },
      );
      let output = '';
      child.stdout.on('data', (chunk) => (output += chunk));
      child.stderr.on('data', (chunk) => (output += chunk));
      const status = await new Promise<number | null>((resolve) => child.on('close', resolve));
      return { status, output, deletes: requests.filter((line) => line.startsWith('DELETE')) };
    }

    const versionsPath = '/orgs/promptfoo/packages/container/promptfoo/versions';

    it('lists every page and changes nothing in a dry run', async () => {
      const { status, output, deletes } = await run([]);

      expect(status).toBe(0);
      expect(output).toContain('101 versions, 6 tagged. 5 to remove');
      expect(output).toContain('would remove sha-0123abc');
      expect(output).toContain('Dry run: nothing was removed.');
      expect(deletes).toEqual([]);
    });

    it('deletes exactly the planned versions', async () => {
      const { status, deletes } = await run(['--delete']);

      expect(status).toBe(0);
      expect(deletes).toEqual([
        `DELETE ${versionsPath}/11`,
        `DELETE ${versionsPath}/12`,
        `DELETE ${versionsPath}/13`,
        `DELETE ${versionsPath}/21`,
        `DELETE ${versionsPath}/22`,
      ]);
    });

    it('keeps going past a version GitHub refuses to delete, then fails', async () => {
      const { status, output, deletes } = await run(['--delete'], 12);

      expect(output).toContain('::warning::could not remove sha-4567def');
      expect(output).toContain('removed sha-89abcde');
      expect(output).toContain('1 of 5 versions could not be removed');
      expect(status).toBe(1);
      // The image that stayed keeps its attestation. The other attestation goes.
      expect(deletes).toEqual([
        `DELETE ${versionsPath}/11`,
        `DELETE ${versionsPath}/12`,
        `DELETE ${versionsPath}/13`,
        `DELETE ${versionsPath}/21`,
      ]);
      expect(output).toContain(`kept sha256-${'b'.repeat(64)}`);
    });
  });
});
