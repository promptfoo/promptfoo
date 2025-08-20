import chalk from 'chalk';
import { Command } from 'commander';

import { fetchWithProxy } from '../fetch';
import { cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';

interface JiraEnv {
  host: string;
  email: string;
  token: string;
  projectKey: string;
}

function toADF(text: string) {
  const safeText = text ?? '';
  return {
    version: 1,
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: safeText,
          },
        ],
      },
    ],
  } as const;
}

async function getJiraEnv(): Promise<JiraEnv> {
  const host = process.env.JIRA_HOST;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  const projectKey = process.env.JIRA_PROJECT_KEY;
  if (!host || !email || !token || !projectKey) {
    throw new Error(
      'Missing Jira configuration. Please set JIRA_HOST, JIRA_EMAIL, JIRA_API_TOKEN, and JIRA_PROJECT_KEY.',
    );
  }
  return { host, email, token, projectKey };
}

async function cloudGet(path: string): Promise<any> {
  const apiHost = cloudConfig.getApiHost();
  const apiKey = cloudConfig.getApiKey();
  const url = `${apiHost}/api/v1/${path}`;
  const res = await fetchWithProxy(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Cloud request failed (${res.status}): ${body}`);
  }
  return res.json();
}

async function jiraPost(host: string, email: string, token: string, path: string, body: any) {
  const url = `https://${host}/rest/api/3/${path}`;
  const res = await fetchWithProxy(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64'),
      'X-Atlassian-Token': 'no-check',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira POST ${path} failed (${res.status}): ${text}`);
  }
  const txt = await res.text();
  if (!txt) return {} as any;
  try {
    return JSON.parse(txt);
  } catch {
    return {} as any;
  }
}

async function createParentIssue(
  jira: JiraEnv,
  summary: string,
  description: string,
  projectKey: string,
) {
  const payload = {
    fields: {
      project: { key: projectKey },
      summary,
      issuetype: { name: 'Task' },
      description: toADF(description),
      labels: ['promptfoo', 'redteam'],
    },
  };
  const created = await jiraPost(jira.host, jira.email, jira.token, 'issue', payload);
  return created.key as string;
}

async function createSubtask(
  jira: JiraEnv,
  parentKey: string,
  summary: string,
  description: string,
  projectKey: string,
) {
  const payload = {
    fields: {
      project: { key: projectKey },
      parent: { key: parentKey },
      summary,
      issuetype: { name: 'Sub-task' },
      description: toADF(description),
      labels: ['promptfoo', 'redteam'],
    },
  };
  try {
    const created = await jiraPost(jira.host, jira.email, jira.token, 'issue', payload);
    return created.key as string;
  } catch (e) {
    // Fallback: create a normal issue linked to parent if Sub-task type is unavailable
    const fallback = {
      fields: {
        project: { key: projectKey },
        summary,
        description: toADF(description),
        issuetype: { name: 'Task' },
        labels: ['promptfoo', 'redteam'],
      },
    };
    const created = await jiraPost(jira.host, jira.email, jira.token, 'issue', fallback);
    const childKey = created.key as string;
    // Link issues
    await jiraPost(jira.host, jira.email, jira.token, 'issueLink', {
      type: { name: 'Relates' },
      inwardIssue: { key: childKey },
      outwardIssue: { key: parentKey },
    });
    return childKey;
  }
}

export function jiraCommand(program: Command) {
  const jiraCmd = program.command('jira').description('Jira integrations');

  jiraCmd
    .command('sync')
    .description('Create Jira issues from a cloud eval')
    .requiredOption('--eval-id <id>', 'Evaluation ID to sync')
    .action(async (opts) => {
      try {
        if (!cloudConfig.isEnabled()) {
          logger.error(
            `Cloud is not configured. Please login with ${chalk.bold('promptfoo auth login')} or set PROMPTFOO_API_KEY`,
          );
          process.exitCode = 1;
          return;
        }
        const jira = await getJiraEnv();
        const evalId = opts.evalId as string;

        // Fetch Jira candidates from cloud
        const data = await cloudGet(`jira/candidates/${evalId}`);

        const date = new Date(data.createdAt).toISOString().split('T')[0];
        const n = data.summary.totalFailures || 0;
        const k = (data.summary.failingPlugins || []).length;
        const parentSummary = `Redteam: ${n} failures across ${k} plugins (${date})`;
        const appUrl = cloudConfig.getAppUrl().replace(/\/$/, '');
        const shareLink = `${appUrl}/eval/${evalId}`;
        const parentDesc = `Eval ${evalId}\nLink: ${shareLink}\n\nProviders: ${data.providers?.map((p: any) => p.label || p.id).join(', ') || ''}\nFailures: ${n}`;

        const parentKey = await createParentIssue(jira, parentSummary, parentDesc, jira.projectKey);
        logger.info(`Created parent issue ${parentKey}`);

        // For each failing plugin, create a sub-issue with up to 3 examples
        for (const p of data.plugins || []) {
          const examples = p.examples || [];
          const body = examples
            .map(
              (ex: any, idx: number) =>
                `Example ${idx + 1}:\nReason: ${ex.reason || ''}\nProvider: ${ex.provider || ''}\nPrompt: ${ex.prompt || ''}\nOutput: ${ex.output || ''}`,
            )
            .join('\n\n');
          const summary = `[${p.id}] ${p.failCount} failures`;
          const key = await createSubtask(jira, parentKey, summary, body, jira.projectKey);
          logger.info(`Created sub-issue ${key} for plugin ${p.id}`);
        }
      } catch (err) {
        logger.error(String(err));
        process.exitCode = 1;
      }
    });
}
