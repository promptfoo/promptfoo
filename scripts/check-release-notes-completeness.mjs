import { execFileSync } from 'node:child_process';
import path from 'node:path';

const [baseRef, headRef] = process.argv.slice(2);
const repository = process.env.GITHUB_REPOSITORY || 'promptfoo/promptfoo';

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function readFile(ref, file) {
  return git('show', `${ref}:${file}`);
}

function commitId(ref) {
  return git('rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`).trim();
}

function versionNotes(markdown, version) {
  const sections = [...markdown.matchAll(/^## \[(\d+\.\d+\.\d+[^\]]*)\].*$/gm)];
  const index = sections.findIndex((heading) => heading[1] === version);
  if (index < 0) {
    throw new Error(`CHANGELOG is missing the ${version} release section`);
  }
  return markdown.slice(sections[index].index, sections[index + 1]?.index);
}

function references(notes) {
  const shas = new Set();
  const pulls = new Set();
  // Use Markdown link destinations so a similarly numbered PR in another repository
  // (or a number in its label) cannot satisfy the inventory.
  const text = notes
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/\[[^\]\n]*\]\(([^\s)]+)\)/g, '$1');
  const plain = text.replace(/https?:\/\/[^\s)>\]]+/g, (url) => {
    if (!URL.canParse(url)) {
      return ' ';
    }
    const { hostname, pathname } = new URL(url);
    const prefix = `/${repository}/`.toLowerCase();
    if (hostname === 'github.com' && pathname.toLowerCase().startsWith(prefix)) {
      const [, type, id] =
        /^(pull|issues|commit)\/([a-f\d]+)\/?$/i.exec(pathname.slice(prefix.length)) || [];
      if (type === 'commit' && /^[a-f\d]{7,40}$/i.test(id)) {
        shas.add(id.toLowerCase());
      }
      if ((type === 'pull' || type === 'issues') && /^\d+$/.test(id)) {
        pulls.add(id);
      }
    }
    return ' ';
  });
  for (const match of plain.matchAll(/\b[a-f\d]{7,40}\b/gi)) {
    shas.add(match[0].toLowerCase());
  }
  for (const match of plain.matchAll(/(?<![\w/])#(\d+)\b/g)) {
    pulls.add(match[1]);
  }
  return { shas: [...shas], pulls };
}

function commitsInRange(previous, boundary, component) {
  // Release Please assigns all commits to the root package. Nested components
  // also get every commit touching their path, including cross-component fixes.
  const paths = component === '.' ? [] : [component];
  const fields = git(
    'log',
    '--full-history',
    '--topo-order',
    '-z',
    '--format=%H%x00%B',
    previous ? `${previous}..${boundary}` : boundary,
    '--',
    ...paths,
  ).split('\0');
  const commits = [];
  for (let i = 0; i < fields.length - 1; i += 2) {
    const message = fields[i + 1];
    commits.push({ sha: fields[i], message, subject: message.split('\n', 1)[0] });
  }
  return commits;
}

function visible(message) {
  // Release Please also recognizes conventional entries in nested commit blocks.
  return (
    /^(?:(?:feat|feature|fix|perf|revert)(?:\([^()\n]+\))?!?|[\w-]+(?:\([^()\n]+\))?!):\s+\S/m.test(
      message,
    ) || /^BREAKING[ -]CHANGE:\s+\S/m.test(message)
  );
}

function releaseChanges(commits) {
  const inRange = new Set(commits.map(({ sha }) => sha));
  const reverted = new Set();
  const changes = [];
  for (const commit of commits) {
    if (reverted.has(commit.sha)) {
      continue;
    }
    const isRevert = /^(?:revert(?:\([^()]+\))?!?: |(?:Revert|Reapply) ")/.test(commit.subject);
    const target = isRevert && /^This reverts commit ([a-f\d]{40})\b/m.exec(commit.message)?.[1];
    // Walk newest first so reverting a revert restores the original change.
    if (target && inRange.has(target)) {
      reverted.add(target);
      continue;
    }
    if (
      visible(commit.message) ||
      (target && visible(commit.subject.replace(/^(?:Revert|Reapply) "/, '')))
    ) {
      changes.push(commit);
    }
  }
  return changes;
}

async function coveredByPull(commit, pulls) {
  const squashPull = /\(#(\d+)\)$/.exec(commit.subject)?.[1];
  if (pulls.has(squashPull)) {
    return true;
  }
  // A merge or rebase can omit the PR number from the subject. Resolve the real
  // association only when the local commit/PR references did not match.
  if (!pulls.size || !process.env.GH_TOKEN) {
    return false;
  }
  // biome-ignore lint/style/noRestrictedGlobals: standalone CI validator uses only Node builtins.
  const response = await fetch(
    `https://api.github.com/repos/${repository}/commits/${commit.sha}/pulls?per_page=100`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
      },
    },
  );
  if (!response.ok) {
    throw new Error(`GitHub PR lookup for ${commit.sha} returned ${response.status}`);
  }
  return (await response.json()).some(
    (pr) =>
      pr.merged_at &&
      pr.base.repo.full_name === repository &&
      pr.base.ref === (process.env.GITHUB_BASE_REF || 'main') &&
      pulls.has(String(pr.number)),
  );
}

async function main() {
  const head = commitId(headRef);
  const base = commitId(baseRef);
  const fork = git('merge-base', base, head).trim();
  const previous = JSON.parse(readFile(base, '.release-please-manifest.json'));
  const original =
    fork === base ? previous : JSON.parse(readFile(fork, '.release-please-manifest.json'));

  const candidate = JSON.parse(readFile(head, '.release-please-manifest.json'));
  const config = JSON.parse(readFile(base, 'release-please-config.json'));
  const missing = [];
  for (const [component, options] of Object.entries(config.packages)) {
    const version = candidate[component];
    if (version === original[component]) {
      continue;
    }
    if (original[component] !== previous[component]) {
      throw new Error(
        `${component} has already released ${previous[component]} on the target branch. Refresh this release PR.`,
      );
    }
    const settings = { ...config, ...options };
    const prefix = settings['include-component-in-tag'] ? `${settings.component}-` : '';
    const tag = `${prefix}${settings['include-v-in-tag'] ? 'v' : ''}${previous[component]}`;
    const prior = previous[component] && commitId(`refs/tags/${tag}`);
    if (prior) {
      git('merge-base', '--is-ancestor', prior, base);
    }
    const changelog = path.posix.join(component, options['changelog-path']);
    const notes = versionNotes(readFile(head, changelog), version);
    const { shas, pulls } = references(notes);
    const changes = releaseChanges(commitsInRange(prior, base, component));
    for (const change of changes) {
      if (
        shas.some((prefix) => change.sha.startsWith(prefix)) ||
        (await coveredByPull(change, pulls))
      ) {
        continue;
      }
      missing.push(`${changelog} (${version}): ${change.sha} ${change.subject}`);
    }
    console.log(
      `Checked ${changes.length} release changes for ${component} ${prior ? `since ${tag}` : `from its first commit`}.`,
    );
  }
  if (missing.length) {
    throw new Error(
      `Add a commit or pull request reference to the corresponding version section:\n${missing.join('\n')}`,
    );
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
