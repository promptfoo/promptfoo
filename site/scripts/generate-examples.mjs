/**
 * Pre-build script for the examples gallery.
 * Always exits 0 so docs builds do not fail on missing or malformed metadata.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = join(__dirname, '..', '..', 'examples');
const OUTPUT_PATH = join(__dirname, '..', 'src', '.generated-examples.json');
const GITHUB_BASE = 'https://github.com/promptfoo/promptfoo/tree/main/examples';

function slugToTitle(slug) {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Simple YAML value parser for .metadata.yaml (avoids adding a dependency) */
function parseMetadataYaml(content) {
  const result = { title: '', description: '', tags: [] };

  const titleMatch = content.match(/^title:\s*['"]?(.+?)['"]?\s*$/m);
  if (titleMatch) {
    result.title = titleMatch[1].trim();
  }

  const descMatch = content.match(/^description:\s*['"]?(.+?)['"]?\s*$/m);
  if (descMatch) {
    result.description = descMatch[1].trim();
  }

  const tagsSection = content.match(/^tags:\s*\n((?:\s+-\s+.+\n?)*)/m);
  if (tagsSection) {
    const tagLines = tagsSection[1].matchAll(/^\s+-\s+(.+)$/gm);
    for (const m of tagLines) {
      const tag = m[1].trim().replace(/^['"]|['"]$/g, '');
      if (tag) {
        result.tags.push(tag);
      }
    }
  }

  return result;
}

function parseDescription(configContent) {
  if (!configContent) return '';
  const match = configContent.match(/^description:\s*['"]?(.+?)['"]?\s*$/m);
  return match ? match[1].trim() : '';
}

function getFirstParagraph(readmeContent) {
  const lines = readmeContent.split('\n');
  const paragraphLines = [];
  let foundContent = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!foundContent) {
      if (
        trimmed.startsWith('#') ||
        trimmed === '' ||
        trimmed.startsWith('```') ||
        trimmed.startsWith('You can run')
      ) {
        continue;
      }
      foundContent = true;
    }
    if (foundContent) {
      if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('```')) {
        break;
      }
      paragraphLines.push(trimmed);
    }
  }
  return paragraphLines.join(' ');
}

function readMetadata(dir) {
  const metadataPath = join(dir, '.metadata.yaml');
  if (!existsSync(metadataPath)) return null;
  try {
    return parseMetadataYaml(readFileSync(metadataPath, 'utf-8'));
  } catch {
    return null;
  }
}

function readFallbackDescription(dir) {
  const configPath = join(dir, 'promptfooconfig.yaml');
  if (existsSync(configPath)) {
    try {
      const desc = parseDescription(readFileSync(configPath, 'utf-8'));
      if (desc) return desc;
    } catch {
      /* skip */
    }
  }
  const readmePath = join(dir, 'README.md');
  if (existsSync(readmePath)) {
    try {
      return getFirstParagraph(readFileSync(readmePath, 'utf-8'));
    } catch {
      /* skip */
    }
  }
  return '';
}

function scanExamples() {
  const entries = readdirSync(EXAMPLES_DIR).filter((name) => {
    if (name.startsWith('.') || name === 'AGENTS.md' || name === 'CLAUDE.md') {
      return false;
    }
    const fullPath = join(EXAMPLES_DIR, name);
    return statSync(fullPath).isDirectory();
  });

  const examples = [];
  let metadataCount = 0;

  for (const slug of entries.sort()) {
    const dir = join(EXAMPLES_DIR, slug);
    const metadata = readMetadata(dir);

    const humanName = metadata?.title || slugToTitle(slug);
    const description = metadata?.description || readFallbackDescription(dir);
    const tags = metadata?.tags?.length ? metadata.tags : ['Other'];

    if (metadata) metadataCount++;

    examples.push({
      slug,
      humanName,
      description,
      tags,
      initCommand: `promptfoo init --example ${slug}`,
      githubUrl: `${GITHUB_BASE}/${slug}`,
    });
  }

  return { examples, metadataCount };
}

function main() {
  const { examples, metadataCount } = scanExamples();

  const tagCounts = {};
  for (const ex of examples) {
    for (const tag of ex.tags) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }

  const MIN_TAG_COUNT = 3;

  // Keep filter chips focused and pin the onboarding category first.
  const pinned = ['Getting Started'];
  const tags = Object.entries(tagCounts)
    .filter(([, count]) => count >= MIN_TAG_COUNT)
    .sort(([a], [b]) => {
      const ai = pinned.indexOf(a);
      const bi = pinned.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    })
    .map(([label, count]) => ({ id: label.toLowerCase().replace(/\s+/g, '-'), label, count }));

  const output = {
    generatedAt: new Date().toISOString(),
    totalCount: examples.length,
    tags,
    examples,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');

  const multiTagged = examples.filter((e) => e.tags.length > 1).length;
  console.log(
    `[generate-examples] Wrote ${examples.length} examples (${metadataCount} with .metadata.yaml), ${tags.length} tags (${multiTagged} multi-tagged)`,
  );
}

main();
