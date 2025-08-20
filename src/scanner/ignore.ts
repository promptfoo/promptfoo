export const DEFAULT_EXCLUDES: string[] = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.out',
  'target',
  'venv',
  '.venv',
  '__pycache__',
  '.next',
  '.nuxt',
  '.gradle',
  '.idea',
  '.vscode',
  'coverage',
  '.cache',
  '.turbo',
  '.parcel-cache',
];

export function isPathExcluded(pathname: string, excludes: string[] = DEFAULT_EXCLUDES): boolean {
  const parts = pathname.split('/');
  return parts.some((p) => excludes.includes(p));
}

export function isBinaryByExtension(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return (
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.pdf') ||
    lower.endsWith('.zip') ||
    lower.endsWith('.gz') ||
    lower.endsWith('.tar') ||
    lower.endsWith('.7z') ||
    lower.endsWith('.ico') ||
    lower.endsWith('.mp3') ||
    lower.endsWith('.mp4') ||
    lower.endsWith('.wav') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.lock') ||
    // Non-code we should skip
    lower.endsWith('.md') ||
    lower.endsWith('.mdx') ||
    lower.endsWith('.markdown') ||
    lower.endsWith('.log')
  );
} 