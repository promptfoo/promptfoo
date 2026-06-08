const URL_PATTERN = /https?:\/\/[^\s<>()\[\]{}"']+/gi;
// Lookbehind excludes:
//   @         email locals (foo@www.x)
//   \w        already inside a longer host token (mywww.x)
//   -         host like a-www.x
//   /  :      already inside an http(s):// URL (don't double-extract)
//   .         already a subdomain of another host (sub.www.x)
const WWW_PATTERN = /(?<![@\w\-/:.])www\.[^\s<>()\[\]{}"']+/gi;
const DOMAIN_PATTERN =
  /(?<![@\w-/])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?![\w-])/gi;
// Lookbehind `(?<![\w.-])` ensures the match is anchored on a real `github.com`
// host, not a subdomain like `docs.github.com` or `gist.github.com`.
const GITHUB_PATTERN =
  /(?<![\w.-])(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/gi;

const GITHUB_RESERVED_PATHS = new Set([
  'features',
  'topics',
  'search',
  'marketplace',
  'pricing',
  'login',
  'signup',
  'explore',
  'collections',
  'events',
  'sponsors',
  'about',
  'enterprise',
  'customer-stories',
  'readme',
  'trending',
  'new',
  'organizations',
  'orgs',
  'users',
  'apps',
  'settings',
  'notifications',
  'codespaces',
  'site',
  'contact',
]);

const TRAILING_CHARS_RE = /[\s.。．，,;；:：!！?？)）\]】}>"'`]+$/;

export interface ExtractedUrl {
  raw: string;
  normalized: string;
  scheme: string;
  host: string;
  path: string;
  query: string;
  fragment: string;
  source: string;
}

export interface ExtractedDomain {
  host: string;
  registered_domain: string;
  subdomain: string;
  domain: string;
  suffix: string;
  raw_host: string;
  source_url?: string;
  source: string;
  from_url: boolean;
}

export interface ExtractedGithubRepo {
  platform: string;
  url: string;
  owner: string;
  repo: string;
  full_name: string;
  branch?: string;
  path?: string;
  link_type: string;
  source: string;
}

export interface ExtractedEntities {
  urls: ExtractedUrl[];
  domains: ExtractedDomain[];
  github_repos: ExtractedGithubRepo[];
  no_links: boolean;
}

type Span = [number, number];

/**
 * Collect [start, end) spans of every full-URL match (URL_PATTERN + WWW_PATTERN)
 * in `text` so downstream extractors can skip matches that fall inside an
 * already-recognized URL (e.g. a domain in a query string).
 */
function collectUrlSpans(text: string): Span[] {
  const spans: Span[] = [];
  for (const re of [URL_PATTERN, WWW_PATTERN]) {
    for (const match of text.matchAll(re)) {
      if (match.index !== undefined) {
        spans.push([match.index, match.index + match[0].length]);
      }
    }
  }
  return spans;
}

/**
 * Strict "inside" check — `idx` must lie strictly between a span's start and
 * end. A match that begins exactly at `start` is treated as the span itself
 * (e.g. `www.github.com/...` is both a `WWW_PATTERN` URL and a github repo)
 * and is not suppressed.
 */
function isInsideAnySpan(idx: number, spans: Span[]): boolean {
  for (const [start, end] of spans) {
    if (idx > start && idx < end) {
      return true;
    }
  }
  return false;
}

function cleanUrl(raw: string): string {
  if (!raw) {
    return '';
  }
  let url = raw.trim();
  url = url.replace(/^[`'"]+|[`'"]+$/g, '');
  url = url.replace(TRAILING_CHARS_RE, '');
  return url;
}

function normalizeUrl(raw: string, defaultScheme: string = 'https'): string {
  const url = cleanUrl(raw);
  if (!url) {
    return '';
  }
  if (!/^https?:\/\//i.test(url)) {
    return `${defaultScheme}://${url}`;
  }
  return url;
}

export function extractUrls(text: string, source: string = 'model_answer'): ExtractedUrl[] {
  if (!text) {
    return [];
  }

  const results: ExtractedUrl[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(URL_PATTERN)) {
    const raw = match[0];
    const normalized = normalizeUrl(raw);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    try {
      const parsed = new URL(normalized);
      const host = (parsed.hostname || '').toLowerCase().replace(/^www\./, '');
      if (!host) {
        continue;
      }

      seen.add(normalized);
      results.push({
        raw: cleanUrl(raw),
        normalized,
        scheme: parsed.protocol.replace(':', ''),
        host,
        path: parsed.pathname,
        query: parsed.search,
        fragment: parsed.hash,
        source,
      });
    } catch {
      // skip invalid
    }
  }

  for (const match of text.matchAll(WWW_PATTERN)) {
    const raw = match[0];
    const normalized = normalizeUrl(raw);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    try {
      const parsed = new URL(normalized);
      const host = (parsed.hostname || '').toLowerCase().replace(/^www\./, '');
      if (!host) {
        continue;
      }

      seen.add(normalized);
      results.push({
        raw: cleanUrl(raw),
        normalized,
        scheme: 'https',
        host,
        path: parsed.pathname,
        query: parsed.search,
        fragment: parsed.hash,
        source,
      });
    } catch {
      // skip invalid
    }
  }

  return results;
}

function normalizeDomain(raw: string): string | null {
  if (!raw) {
    return null;
  }

  let domain = raw.trim().toLowerCase();
  domain = domain.replace(TRAILING_CHARS_RE, '');

  if (domain.startsWith('http://') || domain.startsWith('https://')) {
    try {
      const parsed = new URL(domain);
      domain = parsed.hostname || '';
    } catch {
      return null;
    }
  }

  if (domain.startsWith('www.')) {
    domain = domain.slice(4);
  }
  if (domain.includes('/')) {
    domain = domain.split('/')[0];
  }
  if (domain.includes(':')) {
    domain = domain.split(':')[0];
  }

  domain = domain.replace(/^\.+/, '').replace(TRAILING_CHARS_RE, '');

  if (!domain || /^\d+\.\d+\.\d+\.\d+$/.test(domain)) {
    return null;
  }

  if (domain.length > 253 || !domain.includes('.')) {
    return null;
  }

  const labels = domain.split('.');
  for (const label of labels) {
    if (!label || label.length > 63 || label.startsWith('-') || label.endsWith('-')) {
      return null;
    }
  }

  if (!/^[a-z0-9.-]+$/.test(domain)) {
    return null;
  }

  return domain;
}

function splitDomain(domain: string): {
  registered_domain: string;
  subdomain: string;
  domain: string;
  suffix: string;
} {
  const parts = domain.split('.');
  if (parts.length >= 2) {
    return {
      registered_domain: parts.slice(-2).join('.'),
      subdomain: parts.slice(0, -2).join('.'),
      domain: parts[parts.length - 2],
      suffix: parts[parts.length - 1],
    };
  }
  return {
    registered_domain: domain,
    subdomain: '',
    domain,
    suffix: '',
  };
}

export function extractDomains(
  text: string,
  urls: ExtractedUrl[] = [],
  source: string = 'model_answer',
): ExtractedDomain[] {
  const results: ExtractedDomain[] = [];
  const seen = new Set<string>();

  for (const item of urls) {
    const rawHost = item.host || '';
    const normalized = normalizeDomain(rawHost);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    const split = splitDomain(normalized);
    results.push({
      host: normalized,
      registered_domain: split.registered_domain,
      subdomain: split.subdomain,
      domain: split.domain,
      suffix: split.suffix,
      raw_host: rawHost,
      source_url: item.normalized,
      source: item.source,
      from_url: true,
    });
  }

  // Avoid re-extracting bare domains that already live inside a URL span,
  // e.g. `nonexistent-lib.dev` inside `https://example.com/search?q=nonexistent-lib.dev`.
  const urlSpans = collectUrlSpans(text);

  for (const match of text.matchAll(DOMAIN_PATTERN)) {
    if (match.index !== undefined && isInsideAnySpan(match.index, urlSpans)) {
      continue;
    }
    const raw = match[0];
    const normalized = normalizeDomain(raw);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    const split = splitDomain(normalized);
    results.push({
      host: normalized,
      registered_domain: split.registered_domain,
      subdomain: split.subdomain,
      domain: split.domain,
      suffix: split.suffix,
      raw_host: raw,
      source_url: '',
      source,
      from_url: false,
    });
  }

  return results;
}

export function extractGithubRepos(
  text: string,
  source: string = 'model_answer',
): ExtractedGithubRepo[] {
  const results: ExtractedGithubRepo[] = [];
  const seen = new Set<string>();

  // The GitHub pattern accepts an optional leading `https?://`, so a bare
  // `github.com/owner/repo` substring inside a different URL's path or query
  // would otherwise be mis-extracted as a repo. Skip any match that starts
  // inside an already-recognized URL span.
  const urlSpans = collectUrlSpans(text);

  for (const match of text.matchAll(GITHUB_PATTERN)) {
    if (match.index !== undefined) {
      const matchedText = match[0];
      const hasOwnScheme = /^https?:\/\//i.test(matchedText);
      if (!hasOwnScheme && isInsideAnySpan(match.index, urlSpans)) {
        continue;
      }
    }

    const owner = match[1];
    let repo = match[2];

    if (repo.endsWith('.git')) {
      repo = repo.slice(0, -4);
    }

    if (GITHUB_RESERVED_PATHS.has(owner.toLowerCase())) {
      continue;
    }

    const key = `${owner.toLowerCase()}/${repo.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    results.push({
      platform: 'github',
      url: `https://github.com/${owner}/${repo}`,
      owner,
      repo,
      full_name: `${owner}/${repo}`,
      link_type: 'repo',
      source,
    });
  }

  return results;
}

export function extractAllDomains(
  text: string,
  source: string = 'model_answer',
): ExtractedEntities {
  const urls = extractUrls(text, source);
  const domains = extractDomains(text, urls, source);
  const github_repos = extractGithubRepos(text, source);

  const no_links = urls.length === 0 && domains.length === 0 && github_repos.length === 0;

  return {
    urls,
    domains,
    github_repos,
    no_links,
  };
}
