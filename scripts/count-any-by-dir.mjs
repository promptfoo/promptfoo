#!/usr/bin/env node

import { exec } from 'child_process';
import fs from 'fs/promises';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function main() {
  const entries = await fs.readdir('src', { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  const results = [];

  for (const dir of dirs) {
    try {
      const { stdout } = await execAsync(
        `npx @biomejs/biome lint src/${dir} --max-diagnostics=10000 2>&1 | grep -c "lint/suspicious/noExplicitAny" || echo 0`,
      );
      const count = parseInt(stdout.trim(), 10);
      results.push({ dir, count });
    } catch {
      results.push({ dir, count: 0 });
    }
  }

  results.sort((a, b) => b.count - a.count);

  console.log('\nViolations by directory:\n');
  for (const { dir, count } of results) {
    console.log(`${count.toString().padStart(4)} - src/${dir}/`);
  }

  const total = results.reduce((sum, r) => sum + r.count, 0);
  console.log(`\n${total.toString().padStart(4)} - TOTAL\n`);
}

main().catch(console.error);
