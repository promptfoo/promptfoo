import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import yaml from 'js-yaml';

const REFERENCE_DIR = path.join('site', 'docs', 'api', 'node', 'reference');
const LEGACY_ANCHOR_MANIFEST = path.join('site', 'src', 'data', 'nodeApiLegacyAnchors.json');
const GUIDE_PAGES = {
  examples: path.join('site', 'docs', 'usage', 'node-api-examples.md'),
  package: path.join('site', 'docs', 'usage', 'node-package.md'),
  quickReference: path.join('site', 'docs', 'usage', 'node-api-quick-reference.md'),
  reference: path.join('site', 'docs', 'usage', 'node-api-reference.md'),
} as const;
const LEGACY_ANCHOR_COUNTS = {
  examples: 26,
  package: 7,
  quickReference: 36,
  reference: 47,
} as const;

type GuidePage = keyof typeof GUIDE_PAGES;
type LegacyAnchorManifest = Record<GuidePage, string[]>;

function comparePaths(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function collectMarkdownFiles(directory: string): string[] {
  const files: string[] = [];
  const pending = [directory];

  while (pending.length > 0) {
    const currentDir = pending.pop();
    if (!currentDir) {
      continue;
    }

    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.isFile() && path.extname(entry.name) === '.md') {
        files.push(entryPath);
      }
    }
  }

  return files;
}

function parseFrontmatter(markdown: string, filePath: string): Record<string, unknown> {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match?.[1]) {
    throw new Error(`${filePath} is missing YAML frontmatter`);
  }

  const parsed = yaml.load(match[1]);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${filePath} has invalid YAML frontmatter`);
  }

  return parsed as Record<string, unknown>;
}

function readLegacyAnchorManifest(rootDir: string): LegacyAnchorManifest {
  const manifestPath = path.join(rootDir, LEGACY_ANCHOR_MANIFEST);
  const parsed: unknown = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${manifestPath} must contain an object`);
  }

  return parsed as LegacyAnchorManifest;
}

function validateReferenceFrontmatter(rootDir: string, errors: string[]) {
  const referenceDir = path.join(rootDir, REFERENCE_DIR);
  const readmePath = path.join(referenceDir, 'README.md');
  const generatedPages = collectMarkdownFiles(referenceDir)
    .filter((filePath) => filePath !== readmePath)
    .sort((left, right) =>
      comparePaths(path.relative(referenceDir, left), path.relative(referenceDir, right)),
    );
  const orderedPages = [readmePath, ...generatedPages];
  const sidebarPositionsByDirectory = new Map([[referenceDir, 0]]);

  orderedPages.forEach((filePath) => {
    const relativePath = path.relative(rootDir, filePath);
    let frontmatter: Record<string, unknown>;
    try {
      frontmatter = parseFrontmatter(fs.readFileSync(filePath, 'utf8'), relativePath);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return;
    }

    const directory = path.dirname(filePath);
    const expectedPosition = (sidebarPositionsByDirectory.get(directory) ?? 0) + 1;
    sidebarPositionsByDirectory.set(directory, expectedPosition);
    if (frontmatter.sidebar_position !== expectedPosition) {
      errors.push(
        `${relativePath} must set sidebar_position to ${expectedPosition}; found ${String(frontmatter.sidebar_position)}`,
      );
    }
    if (typeof frontmatter.title !== 'string' || frontmatter.title.length === 0) {
      errors.push(`${relativePath} must set a non-empty title`);
    }
    if (typeof frontmatter.description !== 'string' || frontmatter.description.length === 0) {
      errors.push(`${relativePath} must set a non-empty description`);
    }
  });
}

function validateLegacyAnchorContract(rootDir: string, errors: string[]) {
  const manifest = readLegacyAnchorManifest(rootDir);
  const expectedPages = Object.keys(GUIDE_PAGES).sort(comparePaths);
  const manifestPages = Object.keys(manifest).sort(comparePaths);

  if (expectedPages.join('\n') !== manifestPages.join('\n')) {
    errors.push(
      `Legacy anchor manifest pages must be ${expectedPages.join(', ')}; found ${manifestPages.join(', ')}`,
    );
  }

  for (const page of expectedPages as GuidePage[]) {
    const anchors = manifest[page];
    if (!Array.isArray(anchors) || anchors.length === 0) {
      errors.push(`Legacy anchor manifest entry ${page} must contain at least one anchor`);
      continue;
    }
    if (anchors.length !== LEGACY_ANCHOR_COUNTS[page]) {
      errors.push(
        `Legacy anchor manifest entry ${page} must contain ${LEGACY_ANCHOR_COUNTS[page]} anchors; found ${anchors.length}`,
      );
    }

    const uniqueAnchors = new Set(anchors);
    if (uniqueAnchors.size !== anchors.length) {
      errors.push(`Legacy anchor manifest entry ${page} contains duplicate anchors`);
    }

    for (const anchor of anchors) {
      if (typeof anchor !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(anchor)) {
        errors.push(`Legacy anchor manifest entry ${page} contains invalid id ${String(anchor)}`);
      }
    }

    const guidePath = path.join(rootDir, GUIDE_PAGES[page]);
    const markdown = fs.readFileSync(guidePath, 'utf8');
    const expectedImport =
      "import LegacyHeadingAnchors from '@site/src/components/LegacyHeadingAnchors';";
    const expectedUsage = `<LegacyHeadingAnchors page="${page}" />`;

    if (!markdown.includes(expectedImport)) {
      errors.push(`${GUIDE_PAGES[page]} must import LegacyHeadingAnchors`);
    }
    if (!markdown.includes(expectedUsage)) {
      errors.push(`${GUIDE_PAGES[page]} must render ${expectedUsage}`);
    }
  }
}

export function validateNodeApiDocs(rootDir = process.cwd()) {
  const errors: string[] = [];
  validateReferenceFrontmatter(rootDir, errors);
  validateLegacyAnchorContract(rootDir, errors);

  if (errors.length > 0) {
    throw new Error(`Node.js API documentation contract failed:\n- ${errors.join('\n- ')}`);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  validateNodeApiDocs();
  console.log('Node.js API documentation contract is valid.');
}
