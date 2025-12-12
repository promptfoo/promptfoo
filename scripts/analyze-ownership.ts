#!/usr/bin/env npx ts-node

/**
 * Code Ownership Analysis Tool
 *
 * Analyzes git history to determine code ownership patterns and suggest CODEOWNERS.
 *
 * Metrics calculated:
 * - Line ownership (git blame): Who wrote the code currently in files
 * - Commit activity (git log): Who has been actively committing
 * - Recency weighting: Recent contributions weighted more heavily
 */

import { execSync } from 'child_process';
import * as path from 'path';

// Configuration
const CONFIG = {
  // Recency decay: λ for e^(-λ * days). 0.0077 ≈ 90-day half-life
  recencyDecayLambda: 0.0077,

  // How far back to look for commits
  commitHistoryDays: 365,

  // Weights for combining metrics (must sum to 1)
  weights: {
    blame: 0.5, // Current line ownership
    commits: 0.3, // Commit count (recency weighted)
    linesChanged: 0.2, // Lines added/removed (recency weighted)
  },

  // Thresholds for ownership decisions
  thresholds: {
    primaryOwner: 0.25, // Must have >25% to be primary owner
    coOwner: 0.15, // Must have >15% to be co-owner
    fragmented: 0.2, // If top score <20%, ownership is fragmented
  },

  // Directories to skip
  excludeDirs: ['node_modules', 'dist', 'build', '.git', 'coverage', '.next', '.cache'],

  // File patterns to skip for blame (binary, generated, etc.)
  excludeFilePatterns: [
    /\.png$/,
    /\.jpg$/,
    /\.jpeg$/,
    /\.gif$/,
    /\.ico$/,
    /\.woff2?$/,
    /\.ttf$/,
    /\.eot$/,
    /\.svg$/,
    /\.lock$/,
    /package-lock\.json$/,
    /\.min\.js$/,
    /\.min\.css$/,
    /\.map$/,
  ],

  // Known bots to exclude
  botAuthors: [
    'dependabot[bot]',
    'dependabot',
    'renovate[bot]',
    'renovate',
    'github-actions[bot]',
    'github-actions',
    'use-tusk[bot]',
    'gru-agent[bot]',
  ],

  // Authors to exclude from ownership calculations (non-team members, etc.)
  excludedAuthors: ['ian webster', 'ian@promptfoo.dev', 'albert lie', 'sklein12', 'sklein'],

  // Authors that are only included for specific paths
  conditionalAuthors: {
    'ian webster': ['site/'],
    'ian@promptfoo.dev': ['site/'],
  } as Record<string, string[]>,

  // Minimum lines in a file to consider for blame analysis
  minLinesForBlame: 5,
};

interface AuthorStats {
  name: string;
  email: string;
  blameLines: number;
  commits: number;
  linesAdded: number;
  linesDeleted: number;
  lastCommitDate: Date;
  recencyWeightedCommits: number;
  recencyWeightedLines: number;
}

interface FileStats {
  path: string;
  totalLines: number;
  authors: Map<string, AuthorStats>;
}

interface DirectoryStats {
  path: string;
  fileCount: number;
  totalLines: number;
  authors: Map<string, AuthorStats>;
  files: FileStats[];
}

interface OwnershipReport {
  directory: string;
  primaryOwner: string | null;
  primaryOwnerScore: number;
  coOwners: Array<{ name: string; score: number }>;
  allContributors: Array<{ name: string; score: number; stats: AuthorStats }>;
  stats: {
    fileCount: number;
    totalLines: number;
    contributorCount: number;
    avgFileAge: number;
  };
  flags: string[];
}

function execGit(command: string): string {
  try {
    return execSync(command, {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
    });
  } catch (error) {
    return '';
  }
}

function normalizeAuthorKey(name: string, email: string): string {
  // Normalize by email primarily, fall back to name
  const normalizedEmail = email.toLowerCase().trim();
  if (normalizedEmail && normalizedEmail !== 'not.committed.yet') {
    return normalizedEmail;
  }
  return name.toLowerCase().trim();
}

function isBot(name: string, email: string): boolean {
  const lowerName = name.toLowerCase();
  const lowerEmail = email.toLowerCase();
  return CONFIG.botAuthors.some(
    (bot) => lowerName.includes(bot.toLowerCase()) || lowerEmail.includes(bot.toLowerCase()),
  );
}

// Track current analysis path for conditional exclusions
let currentAnalysisPath = '';

function isExcludedAuthor(name: string, email: string): boolean {
  const lowerName = name.toLowerCase();
  const lowerEmail = email.toLowerCase();

  // Check if author is in excluded list
  const isExcluded = CONFIG.excludedAuthors.some(
    (excluded) =>
      lowerName.includes(excluded.toLowerCase()) || lowerEmail.includes(excluded.toLowerCase()),
  );

  if (!isExcluded) {
    return false;
  }

  // Check if author has conditional inclusion for current path
  for (const [author, allowedPaths] of Object.entries(CONFIG.conditionalAuthors)) {
    if (lowerName.includes(author.toLowerCase()) || lowerEmail.includes(author.toLowerCase())) {
      // Author is conditionally included - check if current path matches
      if (allowedPaths.some((p) => currentAnalysisPath.startsWith(p))) {
        return false; // Don't exclude - they're allowed for this path
      }
    }
  }

  return isExcluded;
}

function shouldExcludeContributor(name: string, email: string): boolean {
  return isBot(name, email) || isExcludedAuthor(name, email);
}

function shouldExcludeFile(filePath: string): boolean {
  return CONFIG.excludeFilePatterns.some((pattern) => pattern.test(filePath));
}

function calculateRecencyWeight(date: Date): number {
  const now = new Date();
  const daysSince = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
  return Math.exp(-CONFIG.recencyDecayLambda * daysSince);
}

function getFilesInDirectory(dirPath: string): string[] {
  const excludeArgs = CONFIG.excludeDirs.map((d) => `":!${d}"`).join(' ');

  const output = execGit(`git ls-files "${dirPath}" -- ${excludeArgs}`);
  if (!output) return [];

  return output
    .split('\n')
    .filter((f) => f.trim())
    .filter((f) => !shouldExcludeFile(f));
}

function getBlameStats(
  filePath: string,
): Map<string, { lines: number; name: string; email: string }> {
  const stats = new Map<string, { lines: number; name: string; email: string }>();

  const output = execGit(`git blame --line-porcelain "${filePath}" 2>/dev/null`);
  if (!output) return stats;

  const lines = output.split('\n');
  let currentAuthor = '';
  let currentEmail = '';

  for (const line of lines) {
    if (line.startsWith('author ')) {
      currentAuthor = line.substring(7);
    } else if (line.startsWith('author-mail ')) {
      currentEmail = line.substring(12).replace(/[<>]/g, '');
    } else if (line.startsWith('\t')) {
      // This is the actual code line - count it
      if (currentAuthor && !shouldExcludeContributor(currentAuthor, currentEmail)) {
        const key = normalizeAuthorKey(currentAuthor, currentEmail);
        const existing = stats.get(key) || { lines: 0, name: currentAuthor, email: currentEmail };
        existing.lines++;
        stats.set(key, existing);
      }
    }
  }

  return stats;
}

function getCommitStats(dirPath: string): Map<
  string,
  {
    commits: number;
    linesAdded: number;
    linesDeleted: number;
    lastDate: Date;
    name: string;
    email: string;
  }
> {
  const stats = new Map<
    string,
    {
      commits: number;
      linesAdded: number;
      linesDeleted: number;
      lastDate: Date;
      name: string;
      email: string;
    }
  >();

  const since = new Date();
  since.setDate(since.getDate() - CONFIG.commitHistoryDays);
  const sinceStr = since.toISOString().split('T')[0];

  // Get commit log with stats
  const output = execGit(
    `git log --since="${sinceStr}" --format="%H|%an|%ae|%aI" --numstat -- "${dirPath}"`,
  );
  if (!output) return stats;

  const lines = output.split('\n');
  let currentAuthor = '';
  let currentEmail = '';
  let currentDate = new Date();

  for (const line of lines) {
    if (line.includes('|')) {
      // Commit header line
      const parts = line.split('|');
      if (parts.length >= 4) {
        currentAuthor = parts[1];
        currentEmail = parts[2];
        currentDate = new Date(parts[3]);

        if (!shouldExcludeContributor(currentAuthor, currentEmail)) {
          const key = normalizeAuthorKey(currentAuthor, currentEmail);
          const existing = stats.get(key) || {
            commits: 0,
            linesAdded: 0,
            linesDeleted: 0,
            lastDate: currentDate,
            name: currentAuthor,
            email: currentEmail,
          };
          existing.commits++;
          if (currentDate > existing.lastDate) {
            existing.lastDate = currentDate;
          }
          stats.set(key, existing);
        }
      }
    } else if (line.match(/^\d+\t\d+\t/)) {
      // Numstat line: added<tab>deleted<tab>filename
      const parts = line.split('\t');
      const added = parseInt(parts[0], 10) || 0;
      const deleted = parseInt(parts[1], 10) || 0;

      if (currentAuthor && !shouldExcludeContributor(currentAuthor, currentEmail)) {
        const key = normalizeAuthorKey(currentAuthor, currentEmail);
        const existing = stats.get(key);
        if (existing) {
          const weight = calculateRecencyWeight(currentDate);
          existing.linesAdded += added;
          existing.linesDeleted += deleted;
        }
      }
    }
  }

  return stats;
}

function analyzeDirectory(dirPath: string): DirectoryStats {
  // Set current path for conditional author exclusions
  currentAnalysisPath = dirPath;

  const files = getFilesInDirectory(dirPath);
  const dirStats: DirectoryStats = {
    path: dirPath,
    fileCount: files.length,
    totalLines: 0,
    authors: new Map(),
    files: [],
  };

  // Get commit-level stats for the whole directory
  const commitStats = getCommitStats(dirPath);

  // Initialize author stats from commit data
  for (const [key, cStats] of commitStats) {
    const recencyWeight = calculateRecencyWeight(cStats.lastDate);
    dirStats.authors.set(key, {
      name: cStats.name,
      email: cStats.email,
      blameLines: 0,
      commits: cStats.commits,
      linesAdded: cStats.linesAdded,
      linesDeleted: cStats.linesDeleted,
      lastCommitDate: cStats.lastDate,
      recencyWeightedCommits: cStats.commits * recencyWeight,
      recencyWeightedLines: (cStats.linesAdded + cStats.linesDeleted) * recencyWeight,
    });
  }

  // Analyze each file for blame stats
  for (const file of files) {
    const blameStats = getBlameStats(file);
    let fileLines = 0;

    for (const [key, bStats] of blameStats) {
      fileLines += bStats.lines;

      const existing = dirStats.authors.get(key) || {
        name: bStats.name,
        email: bStats.email,
        blameLines: 0,
        commits: 0,
        linesAdded: 0,
        linesDeleted: 0,
        lastCommitDate: new Date(0),
        recencyWeightedCommits: 0,
        recencyWeightedLines: 0,
      };
      existing.blameLines += bStats.lines;
      if (!existing.name) existing.name = bStats.name;
      if (!existing.email) existing.email = bStats.email;
      dirStats.authors.set(key, existing);
    }

    dirStats.totalLines += fileLines;
    dirStats.files.push({
      path: file,
      totalLines: fileLines,
      authors: blameStats as any,
    });
  }

  return dirStats;
}

function calculateOwnershipScores(stats: DirectoryStats): Map<string, number> {
  const scores = new Map<string, number>();

  // Calculate totals for normalization
  let totalBlameLines = 0;
  let totalWeightedCommits = 0;
  let totalWeightedLines = 0;

  for (const [, author] of stats.authors) {
    totalBlameLines += author.blameLines;
    totalWeightedCommits += author.recencyWeightedCommits;
    totalWeightedLines += author.recencyWeightedLines;
  }

  // Calculate normalized scores
  for (const [key, author] of stats.authors) {
    const blameScore = totalBlameLines > 0 ? author.blameLines / totalBlameLines : 0;
    const commitScore =
      totalWeightedCommits > 0 ? author.recencyWeightedCommits / totalWeightedCommits : 0;
    const linesScore =
      totalWeightedLines > 0 ? author.recencyWeightedLines / totalWeightedLines : 0;

    const combinedScore =
      CONFIG.weights.blame * blameScore +
      CONFIG.weights.commits * commitScore +
      CONFIG.weights.linesChanged * linesScore;

    scores.set(key, combinedScore);
  }

  return scores;
}

function generateReport(dirPath: string, stats: DirectoryStats): OwnershipReport {
  const scores = calculateOwnershipScores(stats);

  // Sort by score descending
  const sortedContributors = Array.from(scores.entries())
    .map(([key, score]) => ({
      key,
      name: stats.authors.get(key)?.name || key,
      score,
      stats: stats.authors.get(key)!,
    }))
    .sort((a, b) => b.score - a.score);

  const flags: string[] = [];

  // Determine primary owner
  let primaryOwner: string | null = null;
  let primaryOwnerScore = 0;

  if (
    sortedContributors.length > 0 &&
    sortedContributors[0].score >= CONFIG.thresholds.primaryOwner
  ) {
    primaryOwner = sortedContributors[0].name;
    primaryOwnerScore = sortedContributors[0].score;
  } else if (sortedContributors.length > 0) {
    flags.push(
      `FRAGMENTED: Top contributor (${sortedContributors[0].name}) only has ${(sortedContributors[0].score * 100).toFixed(1)}% ownership`,
    );
  }

  // Determine co-owners
  const coOwners = sortedContributors
    .slice(1)
    .filter((c) => c.score >= CONFIG.thresholds.coOwner)
    .map((c) => ({ name: c.name, score: c.score }));

  // Check for stale ownership
  const now = new Date();
  for (const contributor of sortedContributors.slice(0, 3)) {
    if (contributor.stats) {
      const daysSinceLastCommit =
        (now.getTime() - contributor.stats.lastCommitDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLastCommit > 90 && contributor.score > 0.1) {
        flags.push(
          `STALE: ${contributor.name} (${(contributor.score * 100).toFixed(1)}%) hasn't committed in ${Math.round(daysSinceLastCommit)} days`,
        );
      }
    }
  }

  // Calculate average file age
  let totalAge = 0;
  let fileCount = 0;
  for (const file of stats.files) {
    const output = execGit(`git log -1 --format="%aI" -- "${file.path}"`);
    if (output) {
      const fileDate = new Date(output.trim());
      const ageDays = (now.getTime() - fileDate.getTime()) / (1000 * 60 * 60 * 24);
      totalAge += ageDays;
      fileCount++;
    }
  }

  return {
    directory: dirPath,
    primaryOwner,
    primaryOwnerScore,
    coOwners,
    allContributors: sortedContributors.map((c) => ({
      name: c.name,
      score: c.score,
      stats: c.stats,
    })),
    stats: {
      fileCount: stats.fileCount,
      totalLines: stats.totalLines,
      contributorCount: stats.authors.size,
      avgFileAge: fileCount > 0 ? totalAge / fileCount : 0,
    },
    flags,
  };
}

function getTopLevelDirectories(basePath: string): string[] {
  const output = execGit(`git ls-files "${basePath}"`);
  if (!output) return [];

  const dirs = new Set<string>();
  const files = output.split('\n').filter((f) => f.trim());

  for (const file of files) {
    // Get first two levels of directory structure
    const parts = file.split('/');
    if (parts.length > 1) {
      dirs.add(parts.slice(0, 2).join('/'));
    }
  }

  // Filter out excluded directories
  return Array.from(dirs).filter((d) => !CONFIG.excludeDirs.some((ex) => d.includes(ex)));
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatReport(report: OwnershipReport): string {
  const lines: string[] = [];

  lines.push(`\n${'='.repeat(70)}`);
  lines.push(`📁 ${report.directory}`);
  lines.push(`${'='.repeat(70)}`);

  lines.push(`\n📊 Statistics:`);
  lines.push(`   Files: ${report.stats.fileCount}`);
  lines.push(`   Lines: ${report.stats.totalLines.toLocaleString()}`);
  lines.push(`   Contributors: ${report.stats.contributorCount}`);
  lines.push(`   Avg file age: ${Math.round(report.stats.avgFileAge)} days`);

  lines.push(`\n👑 Ownership:`);
  if (report.primaryOwner) {
    lines.push(`   Primary: ${report.primaryOwner} (${formatPercent(report.primaryOwnerScore)})`);
  } else {
    lines.push(`   Primary: ⚠️  No clear owner`);
  }

  if (report.coOwners.length > 0) {
    lines.push(
      `   Co-owners: ${report.coOwners.map((c) => `${c.name} (${formatPercent(c.score)})`).join(', ')}`,
    );
  }

  lines.push(`\n📈 All Contributors (top 10):`);
  for (const contributor of report.allContributors.slice(0, 10)) {
    const stats = contributor.stats;
    const daysSinceCommit = stats.lastCommitDate
      ? Math.round((new Date().getTime() - stats.lastCommitDate.getTime()) / (1000 * 60 * 60 * 24))
      : 'N/A';
    lines.push(
      `   ${formatPercent(contributor.score).padStart(6)} | ${contributor.name.padEnd(25)} | ` +
        `${stats.blameLines.toString().padStart(5)} lines | ${stats.commits.toString().padStart(3)} commits | ` +
        `last: ${daysSinceCommit}d ago`,
    );
  }

  if (report.flags.length > 0) {
    lines.push(`\n⚠️  Flags:`);
    for (const flag of report.flags) {
      lines.push(`   • ${flag}`);
    }
  }

  return lines.join('\n');
}

function generateCodeownersEntry(report: OwnershipReport): string | null {
  if (!report.primaryOwner && report.coOwners.length === 0) {
    return null;
  }

  const owners: string[] = [];
  if (report.primaryOwner) {
    owners.push(`@${report.primaryOwner.replace(/\s+/g, '-').toLowerCase()}`);
  }
  for (const coOwner of report.coOwners.slice(0, 2)) {
    owners.push(`@${coOwner.name.replace(/\s+/g, '-').toLowerCase()}`);
  }

  return `/${report.directory}/`.padEnd(40) + owners.join(' ');
}

async function main() {
  console.log('🔍 Code Ownership Analysis Tool');
  console.log('================================\n');

  const args = process.argv.slice(2);
  const basePath = args[0] || 'src';

  console.log(`Analyzing: ${basePath}`);
  console.log(`Commit history: ${CONFIG.commitHistoryDays} days`);
  console.log(`Recency half-life: ~${Math.round(Math.log(2) / CONFIG.recencyDecayLambda)} days`);
  console.log(
    `Weights: blame=${CONFIG.weights.blame}, commits=${CONFIG.weights.commits}, lines=${CONFIG.weights.linesChanged}`,
  );

  // Get directories to analyze
  const directories = getTopLevelDirectories(basePath);
  console.log(`\nFound ${directories.length} directories to analyze...\n`);

  const reports: OwnershipReport[] = [];

  for (const dir of directories) {
    process.stdout.write(`Analyzing ${dir}...`);
    const stats = analyzeDirectory(dir);
    const report = generateReport(dir, stats);
    reports.push(report);
    console.log(` done (${stats.fileCount} files, ${stats.authors.size} contributors)`);
  }

  // Also analyze top-level
  process.stdout.write(`Analyzing ${basePath} (top-level)...`);
  const topStats = analyzeDirectory(basePath);
  const topReport = generateReport(basePath, topStats);
  console.log(` done`);

  // Print reports
  console.log('\n\n' + '🏆 OWNERSHIP ANALYSIS RESULTS'.padStart(50));
  console.log('='.repeat(70));

  for (const report of reports.sort((a, b) => b.stats.totalLines - a.stats.totalLines)) {
    console.log(formatReport(report));
  }

  // Print summary
  console.log('\n\n' + '📋 SUMMARY'.padStart(40));
  console.log('='.repeat(70));

  console.log('\n🔴 Directories needing attention (fragmented/no owner):');
  const needsAttention = reports.filter((r) => !r.primaryOwner || r.flags.length > 0);
  if (needsAttention.length === 0) {
    console.log('   None! All directories have clear ownership.');
  } else {
    for (const report of needsAttention) {
      console.log(`   • ${report.directory}: ${report.flags[0] || 'No clear owner'}`);
    }
  }

  console.log('\n📝 Suggested CODEOWNERS entries:');
  console.log('```');
  console.log('# Auto-generated ownership suggestions');
  console.log('# Review and adjust GitHub usernames as needed\n');

  const codeownersEntries = reports
    .map((r) => generateCodeownersEntry(r))
    .filter((e) => e !== null);

  for (const entry of codeownersEntries) {
    console.log(entry);
  }
  console.log('```');

  // Top-level summary
  console.log('\n📊 Overall Repository Stats:');
  console.log(formatReport(topReport));
}

main().catch(console.error);
