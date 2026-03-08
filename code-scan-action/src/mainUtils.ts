import { type Comment, formatSeverity, type PullRequestContext } from '../../src/types/codeScan';

export function buildCliArgs({
  apiHost,
  baseBranch,
  context,
  finalConfigPath,
}: {
  apiHost: string;
  baseBranch: string;
  context: PullRequestContext;
  finalConfigPath: string;
}): string[] {
  const repoPath = process.env.GITHUB_WORKSPACE || process.cwd();

  return [
    'code-scans',
    'run',
    repoPath,
    ...(apiHost ? ['--api-host', apiHost] : []),
    '--config',
    finalConfigPath,
    '--base',
    baseBranch,
    '--compare',
    'HEAD',
    '--json',
    '--github-pr',
    `${context.owner}/${context.repo}#${context.number}`,
  ];
}

function buildReviewCommentBody(comment: Comment): string {
  let body = formatSeverity(comment.severity) + comment.finding;

  if (comment.fix) {
    body += `\n\n<details>\n<summary>💡 Suggested Fix</summary>\n\n${comment.fix}\n</details>`;
  }

  if (comment.aiAgentPrompt) {
    body += `\n\n<details>\n<summary>🤖 AI Agent Prompt</summary>\n\n${comment.aiAgentPrompt}\n</details>`;
  }

  return body;
}

export function buildRichIssueCommentBody(comment: Comment): string {
  const body = buildReviewCommentBody(comment);

  if (!comment.file) {
    return body;
  }

  const lineRange =
    comment.startLine && comment.line && comment.startLine !== comment.line
      ? `${comment.file}:${comment.startLine}-${comment.line}`
      : comment.line != null
        ? `${comment.file}:${comment.line}`
        : comment.file;

  return `**${lineRange}**\n\n${body}`;
}

export function toReviewComment(comment: Comment) {
  const hasRange = Boolean(comment.startLine && comment.line && comment.startLine < comment.line);

  return {
    path: comment.file!,
    line: comment.line || undefined,
    start_line: hasRange ? comment.startLine : undefined,
    side: 'RIGHT' as const,
    start_side: hasRange ? ('RIGHT' as const) : undefined,
    body: buildReviewCommentBody(comment),
  };
}
