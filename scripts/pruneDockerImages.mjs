// Lists, and with --delete removes, container image versions that carry only build tags.
//
//   GITHUB_TOKEN=... node scripts/pruneDockerImages.mjs --org promptfoo --package promptfoo
//
// Options:
//   --older-than-days <n>  Only versions last updated more than n days ago (default 30).
//   --tags <a,b,...>       Exact tags to treat as disposable too, comma-separated. For
//                          branch builds and other one-off tags.
//   --delete               Delete the listed versions. Without it nothing is changed.
//
// GitHub can only delete a whole version (one digest with all of its tags), so a version
// is removed only when every tag on it is disposable. A `sha-*` tag that shares its image
// with a release stays, and so do untagged platform manifests.
import { pathToFileURL } from 'node:url';

// Actions sets GITHUB_API_URL, which also covers GitHub Enterprise Server.
const API = process.env.GITHUB_API_URL || 'https://api.github.com';

// Never accepted by --tags, whatever is passed.
const PROTECTED_TAGS = [
  /^latest$/,
  /^main$/,
  // Releases and prereleases, and the `major.minor` alias.
  /^\d+\.\d+\.\d+([.-][0-9A-Za-z.-]+)?$/,
  /^\d+\.\d+$/,
  // The build caches the Docker workflow reads on every run.
  /^buildcache-linux-(amd64|arm64)$/,
];
// Disposable by default: the per-commit tag of a build, and the caches of old backfills.
const BUILD_TAGS = [/^sha-[0-9a-f]{7,40}$/, /^buildcache-linux-(amd64|arm64)-\d+\.\d+\.\d+$/];
// Attestations are stored under a tag named after the digest they describe.
const ATTESTATION_TAG = /^sha256-([0-9a-f]{64})(\..+)?$/;

const matchesAny = (patterns, tag) => patterns.some((pattern) => pattern.test(tag));
const tagsOf = (version) => version.metadata?.container?.tags ?? [];

/** The image digests an attestation version describes, or none for any other version. */
export function attestationSubjects(version) {
  const tags = tagsOf(version);
  if (tags.length === 0 || !tags.every((tag) => ATTESTATION_TAG.test(tag))) {
    return [];
  }
  return tags.map((tag) => `sha256:${tag.match(ATTESTATION_TAG)[1]}`);
}

/**
 * Decide which versions to remove. Pure, so it can be tested without the API.
 *
 * @param versions Package versions as the GitHub API returns them.
 * @param options.now Current time in milliseconds.
 * @param options.olderThanDays Minimum age, by `updated_at`, of a version to remove.
 * @param options.extraTags Exact tags to treat as disposable.
 */
export function planPrune(versions, { now, olderThanDays, extraTags = [] }) {
  const cutoff = now - olderThanDays * 24 * 60 * 60 * 1000;
  const extra = new Set(extraTags);
  const isOld = (version) => Date.parse(version.updated_at ?? version.created_at) < cutoff;

  const remove = [];
  for (const version of versions) {
    const tags = tagsOf(version);
    // An attestation is only ever removed with its image, in the second pass below.
    if (tags.length === 0 || !isOld(version) || attestationSubjects(version).length > 0) {
      continue;
    }
    // Any other tag on the same image, such as a release or `main`, keeps it.
    if (tags.every((tag) => matchesAny(BUILD_TAGS, tag) || extra.has(tag))) {
      remove.push(version);
    }
  }

  // An attestation goes with the image it describes, and is an orphan once that is gone.
  const removedDigests = new Set(remove.map((version) => version.name));
  const remainingDigests = new Set(
    versions.map((version) => version.name).filter((digest) => !removedDigests.has(digest)),
  );
  for (const version of versions) {
    const subjects = attestationSubjects(version);
    if (subjects.length > 0 && subjects.every((digest) => !remainingDigests.has(digest))) {
      remove.push(version);
    }
  }
  return remove;
}

function parseArgs(argv) {
  const options = { olderThanDays: 30, extraTags: [], delete: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--delete') {
      options.delete = true;
    } else if (arg === '--org') {
      options.org = argv[++index];
    } else if (arg === '--package') {
      options.package = argv[++index];
    } else if (arg === '--older-than-days') {
      options.olderThanDays = Number(argv[++index]);
    } else if (arg === '--tags') {
      const names = (argv[++index] ?? '').split(',').map((name) => name.trim());
      options.extraTags.push(...names.filter(Boolean));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!options.org || !options.package) {
    throw new Error('--org and --package are required');
  }
  if (!Number.isFinite(options.olderThanDays) || options.olderThanDays < 1) {
    throw new Error('--older-than-days must be a number of at least 1');
  }
  for (const tag of options.extraTags) {
    if (matchesAny(PROTECTED_TAGS, tag)) {
      throw new Error(`--tags cannot name a protected tag: ${tag}`);
    }
  }
  return options;
}

async function github(method, path, token) {
  // biome-ignore lint/style/noRestrictedGlobals: standalone CI script with no dependencies
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 300);
    throw new Error(`${method} ${path} returned ${response.status}: ${body}`);
  }
  return response.status === 204 ? undefined : response.json();
}

async function listVersions(base, token) {
  const versions = [];
  for (let page = 1; ; page++) {
    const batch = await github('GET', `${base}/versions?per_page=100&page=${page}`, token);
    versions.push(...batch);
    if (batch.length < 100) {
      return versions;
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN is required');
  }
  const base = `/orgs/${encodeURIComponent(options.org)}/packages/container/${encodeURIComponent(options.package)}`;
  const versions = await listVersions(base, token);
  const remove = planPrune(versions, {
    now: Date.now(),
    olderThanDays: options.olderThanDays,
    extraTags: options.extraTags,
  });

  const tagged = versions.filter((version) => version.metadata?.container?.tags?.length);
  console.log(
    `${versions.length} versions, ${tagged.length} tagged. ` +
      `${remove.length} to remove (older than ${options.olderThanDays} days).`,
  );
  let failures = 0;
  // Images come before their attestations in the plan. An image that could not be
  // removed keeps its attestation.
  const keptDigests = new Set();
  for (const version of remove) {
    const label = `${version.metadata.container.tags.join(', ')} (${version.name.slice(0, 19)}, updated ${version.updated_at.slice(0, 10)})`;
    if (!options.delete) {
      console.log(`would remove ${label}`);
      continue;
    }
    if (attestationSubjects(version).some((digest) => keptDigests.has(digest))) {
      console.log(`kept ${label}: its image could not be removed`);
      continue;
    }
    try {
      await github('DELETE', `${base}/versions/${version.id}`, token);
      console.log(`removed ${label}`);
    } catch (error) {
      // GitHub refuses to delete a public version with more than 5,000 downloads.
      // Keep going so one such version does not block the rest.
      failures++;
      keptDigests.add(version.name);
      console.log(`::warning::could not remove ${label}: ${error.message}`);
    }
  }
  if (!options.delete) {
    console.log('Dry run: nothing was removed. Pass --delete to remove these versions.');
  }
  if (failures > 0) {
    throw new Error(`${failures} of ${remove.length} versions could not be removed`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
