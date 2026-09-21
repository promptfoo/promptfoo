import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectPublicDocMarkdown } from './llmsTxt';

describe('collectPublicDocMarkdown', () => {
  let docsDir: string;

  beforeEach(async () => {
    docsDir = await mkdtemp(join(tmpdir(), 'promptfoo-llms-docs-'));
  });

  afterEach(async () => {
    await rm(docsDir, { recursive: true, force: true });
  });

  async function writeDoc(relativePath: string, content: string) {
    const fullPath = join(docsDir, relativePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content);
  }

  it('collects public Markdown and MDX recursively', async () => {
    await Promise.all([
      writeDoc('index.md', 'Root docs'),
      writeDoc('guides/setup.mdx', 'Nested docs'),
      writeDoc('guides/image.svg', 'Not Markdown'),
    ]);

    expect((await collectPublicDocMarkdown(docsDir)).sort()).toEqual(['Nested docs', 'Root docs']);
  });

  it('omits repository instructions and Claude rules at every depth', async () => {
    await Promise.all([
      writeDoc('AGENTS.md', 'Root agent instructions'),
      writeDoc('CLAUDE.md', 'Root Claude instructions'),
      writeDoc('.claude/rules/root.md', 'Root Claude rules'),
      writeDoc('red-team/AGENTS.md', 'Scoped agent instructions'),
      writeDoc('red-team/CLAUDE.md', 'Scoped Claude instructions'),
      writeDoc('red-team/.claude/rules/shared-instructions.md', '@../../AGENTS.md'),
      writeDoc('red-team/using-claude.md', 'Public Claude guide'),
    ]);

    expect(await collectPublicDocMarkdown(docsDir)).toEqual(['Public Claude guide']);
  });
});
