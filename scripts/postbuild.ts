/**
 * Post-build script that copies non-TypeScript assets to the dist directory.
 *
 * This script runs automatically after the TypeScript build (tsdown) completes.
 * It handles:
 * - HTML template files (all *.html in src/)
 * - Python/Go/Ruby wrapper scripts for custom providers
 * - Drizzle ORM migration files
 * - ESM package.json marker
 * - CLI executable permissions
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SRC = path.join(ROOT, 'src');

interface CopyTask {
  src: string;
  dest: string;
  recursive?: boolean;
}

/**
 * Find all HTML files in src/ directory
 */
function getHtmlFiles(): CopyTask[] {
  return fs
    .readdirSync(SRC)
    .filter((file) => file.endsWith('.html'))
    .map((file) => ({
      src: path.join(SRC, file),
      dest: path.join(DIST, 'src', file),
    }));
}

/**
 * Static copy tasks for wrapper scripts and migrations
 */
const staticCopyTasks: CopyTask[] = [
  // Python wrappers
  {
    src: path.join(SRC, 'python', 'wrapper.py'),
    dest: path.join(DIST, 'src', 'python', 'wrapper.py'),
  },
  {
    src: path.join(SRC, 'python', 'persistent_wrapper.py'),
    dest: path.join(DIST, 'src', 'python', 'persistent_wrapper.py'),
  },

  // Go wrapper
  {
    src: path.join(SRC, 'golang', 'wrapper.go'),
    dest: path.join(DIST, 'src', 'golang', 'wrapper.go'),
  },

  // Ruby wrapper
  { src: path.join(SRC, 'ruby', 'wrapper.rb'), dest: path.join(DIST, 'src', 'ruby', 'wrapper.rb') },

  // Drizzle migrations
  { src: path.join(ROOT, 'drizzle'), dest: path.join(DIST, 'drizzle'), recursive: true },
];

const filesToRemove = [
  path.join(DIST, 'drizzle', 'CLAUDE.md'),
  path.join(DIST, 'drizzle', 'AGENTS.md'),
];

function postbuild(): void {
  console.log('Running postbuild...');

  const copyTasks = [...getHtmlFiles(), ...staticCopyTasks];

  // Copy all assets
  for (const task of copyTasks) {
    if (!fs.existsSync(task.src)) {
      console.error(`  ERROR: Source not found: ${task.src.replace(ROOT, '.')}`);
      process.exit(1);
    }

    fs.mkdirSync(path.dirname(task.dest), { recursive: true });

    if (task.recursive) {
      // For recursive copies, remove existing directory first
      fs.rmSync(task.dest, { recursive: true, force: true });
    }

    fs.cpSync(task.src, task.dest, { recursive: task.recursive ?? false });
    console.log(`  Copied: ${task.src.replace(ROOT, '.')} -> ${task.dest.replace(ROOT, '.')}`);
  }

  // Remove files that shouldn't be in dist
  for (const file of filesToRemove) {
    fs.rmSync(file, { force: true });
  }

  // Create ESM package.json marker for dist/src
  // This ensures Node.js treats .js files in dist/src as ESM
  const distSrcPackageJson = path.join(DIST, 'src', 'package.json');
  fs.writeFileSync(distSrcPackageJson, JSON.stringify({ type: 'module' }));
  console.log('  Created: ./dist/src/package.json');

  // Make CLI executable
  const mainJs = path.join(DIST, 'src', 'main.js');
  if (!fs.existsSync(mainJs)) {
    console.error(`  ERROR: CLI not found: ${mainJs.replace(ROOT, '.')}`);
    console.error('  This usually means tsdown failed. Check the build output above.');
    process.exit(1);
  }
  fs.chmodSync(mainJs, 0o755);
  console.log('  Made executable: ./dist/src/main.js');

  console.log('Postbuild complete.');
}

postbuild();
