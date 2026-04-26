import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Internal links that target Docusaurus routes must end in `/` because the
 * site is built with `trailingSlash: true`. A non-canonical href triggers a
 * 308 redirect (caught by SEO crawlers) on the first hop.
 *
 * Docusaurus's own `<Link to="...">` and the MDX `<a>` override (which wraps
 * markdown link syntax `[text](/path)`) auto-normalize internally, so this
 * test deliberately ignores those forms and only inspects link forms that
 * render without normalization:
 *   - raw `href="/..."` in HTML/JSX or string-literal hrefs (e.g. config)
 *   - non-Docusaurus `<Link href="/...">` (e.g. MUI's Link)
 *   - `<Redirect to="/...">` (re-exports react-router-dom; no normalization)
 *   - Docusaurus config `to: "/..."` string routes
 */

const SITE_ROOT = path.resolve(__dirname, '../..');

const SCAN_DIRS = ['blog', 'docs', 'src'];
const SCAN_EXTS = new Set(['.md', '.mdx', '.ts', '.tsx', '.js', '.jsx']);
const ROOT_FILES = ['docusaurus.config.ts'];

const SKIP_DIRS = new Set(['node_modules', 'build', '.docusaurus', 'coverage']);

const ASSET_EXT_RE =
  /\.(?:png|jpe?g|gif|svg|webp|ico|pdf|zip|mp4|mp3|css|js|json|xml|txt|ya?ml|csv|woff2?|ttf|otf|map)$/i;

// Match href / Redirect-to with single, double, or backtick quotes, optionally
// wrapped in a JSX expression `{...}`. The backreference \1 keeps the closing
// quote in sync with the opener.
const HREF_RE = /\bhref\s*=\s*\{?\s*(['"`])(\/[^'"`#?\s]*?)\1/g;
const REDIRECT_TO_RE = /<Redirect\b[^>]*?\bto\s*=\s*\{?\s*(['"`])(\/[^'"`#?\s]*?)\1/g;
const CONFIG_TO_RE = /\bto:\s*(['"`])(\/[^'"`#?\s]*?)\1/g;

function walk(dir: string, out: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      walk(full, out);
    } else if (entry.isFile() && SCAN_EXTS.has(path.extname(entry.name))) {
      if (/\.test\.(?:ts|tsx|js|jsx)$/.test(entry.name)) {
        continue;
      }
      out.push(full);
    }
  }
}

function collectFiles(): string[] {
  const files: string[] = [];
  for (const sub of SCAN_DIRS) {
    const dir = path.join(SITE_ROOT, sub);
    if (fs.existsSync(dir)) {
      walk(dir, files);
    }
  }
  for (const file of ROOT_FILES) {
    const full = path.join(SITE_ROOT, file);
    if (fs.existsSync(full)) {
      files.push(full);
    }
  }
  return files;
}

function lineForOffset(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
    }
  }
  return line;
}

function isInternalPagePath(p: string): boolean {
  if (p === '/' || p.endsWith('/')) {
    return false;
  }
  if (ASSET_EXT_RE.test(p)) {
    return false;
  }
  return true;
}

interface Violation {
  file: string;
  line: number;
  match: string;
  kind: 'href' | 'redirect' | 'config';
}

describe('internal links use canonical trailing slash', () => {
  const files = collectFiles();

  it('scans the site corpus including the announcement-banner config', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.endsWith(`${path.sep}docusaurus.config.ts`))).toBe(true);
  });

  it('has no non-normalized internal links missing a trailing slash', () => {
    const violations: Violation[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf-8');
      const checks: { re: RegExp; kind: Violation['kind'] }[] = [
        { re: HREF_RE, kind: 'href' },
        { re: REDIRECT_TO_RE, kind: 'redirect' },
      ];
      if (file.endsWith(`${path.sep}docusaurus.config.ts`)) {
        checks.push({ re: CONFIG_TO_RE, kind: 'config' });
      }
      for (const { re, kind } of checks) {
        for (const m of text.matchAll(re)) {
          const target = m[2];
          if (!isInternalPagePath(target)) {
            continue;
          }
          violations.push({
            file: path.relative(SITE_ROOT, file),
            line: lineForOffset(text, m.index ?? 0),
            match: m[0],
            kind,
          });
        }
      }
    }

    if (violations.length > 0) {
      const formatted = violations
        .map((v) => `  ${v.file}:${v.line} (${v.kind}) — ${v.match}`)
        .join('\n');
      expect.fail(
        `Found ${violations.length} internal link(s) missing a trailing slash. ` +
          `The site uses trailingSlash: true, so a bare href triggers a 308 redirect. ` +
          `Add a trailing slash, or use <Link to="..."> from @docusaurus/Link which normalizes.\n${formatted}`,
      );
    }
  });
});
