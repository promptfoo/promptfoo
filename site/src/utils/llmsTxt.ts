import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function collectPublicDocMarkdown(directory: string): Promise<string[]> {
  const contents: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === '.claude' || entry.name === 'AGENTS.md' || entry.name === 'CLAUDE.md') {
      continue;
    }

    const filePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      contents.push(...(await collectPublicDocMarkdown(filePath)));
    } else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
      contents.push(await readFile(filePath, 'utf8'));
    }
  }

  return contents;
}
