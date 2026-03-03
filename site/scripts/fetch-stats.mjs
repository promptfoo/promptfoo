/**
 * Pre-build script that fetches live site statistics from public APIs.
 * Writes results to site/src/.generated-stats.json, which is merged over
 * the static fallbacks in site-stats.json by constants.ts.
 *
 * Always exits 0 — build never fails due to stats fetching.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, '..', 'src', '.generated-stats.json');
const TIMEOUT_MS = 10_000;
const REPO = 'promptfoo/promptfoo';
const NPM_PACKAGE = 'promptfoo';

function formatCompact(num) {
  if (num >= 1000) {
    const k = num / 1000;
    return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`;
  }
  return String(num);
}

function formatWithCommas(num) {
  return num.toLocaleString('en-US');
}

function roundToNearest(num, nearest) {
  return Math.round(num / nearest) * nearest;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers = { 'User-Agent': 'promptfoo-site-build', ...options.headers };
    if (process.env.GITHUB_TOKEN) {
      const { hostname } = new URL(url);
      if (hostname === 'api.github.com' || hostname === 'github.com') {
        headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
      }
    }
    const res = await fetch(url, { ...options, headers, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchGitHubStars() {
  const res = await fetchWithTimeout(`https://api.github.com/repos/${REPO}`);
  const data = await res.json();
  return { GITHUB_STARS_DISPLAY: formatCompact(data.stargazers_count) };
}

async function fetchContributorCount() {
  const res = await fetchWithTimeout(
    `https://api.github.com/repos/${REPO}/contributors?per_page=1&anon=true`,
  );
  const linkHeader = res.headers.get('link');
  if (!linkHeader) {
    // If no Link header, there's only one page — count the response
    const data = await res.json();
    return { CONTRIBUTOR_COUNT: data.length };
  }
  const match = linkHeader.match(/page=(\d+)>;\s*rel="last"/);
  if (!match) {
    throw new Error('Could not parse contributor count from Link header');
  }
  return { CONTRIBUTOR_COUNT: Number(match[1]) };
}

async function fetchNpmDownloads() {
  const res = await fetchWithTimeout(
    `https://api.npmjs.org/downloads/point/last-week/${NPM_PACKAGE}`,
  );
  const data = await res.json();
  const rounded = roundToNearest(data.downloads, 1000);
  return { WEEKLY_DOWNLOADS_DISPLAY: formatWithCommas(rounded) };
}

async function main() {
  const fetchers = [
    { name: 'GitHub stars', fn: fetchGitHubStars },
    { name: 'contributor count', fn: fetchContributorCount },
    { name: 'npm downloads', fn: fetchNpmDownloads },
  ];

  const results = await Promise.allSettled(fetchers.map((f) => f.fn()));

  const stats = {};
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      Object.assign(stats, result.value);
    } else {
      console.warn(`[fetch-stats] Failed to fetch ${fetchers[i].name}: ${result.reason}`);
    }
  });

  writeFileSync(OUTPUT_PATH, JSON.stringify(stats, null, 2) + '\n');

  const keys = Object.keys(stats);
  if (keys.length > 0) {
    console.log(`[fetch-stats] Wrote ${keys.length} stats: ${keys.join(', ')}`);
  } else {
    console.log('[fetch-stats] No stats fetched; fallback values will be used');
  }
}

main().catch((err) => {
  console.warn(`[fetch-stats] Unexpected error: ${err.message}`);
});
