import React from 'react';

import GitHubIcon from '@mui/icons-material/GitHub';
import { type FrameProps, PreviewFrame } from './PreviewFrame';
import styles from './previews.module.css';

const review = {
  title: 'Pull request review',
  product: 'GitHub',
  filename: 'agent.ts',
  firstLine: 66,
  lines: [
    'const mcp1 = hostedMcpTool({',
    '  serverLabel: "dropbox",',
    '  connectorId: "connector_dropbox",',
    '  serverDescription: "Knowledge Base",',
    '  allowedTools: [',
    '    "fetch",',
    '    "fetch_file",',
    '    "get_profile",',
    '    "list_recent_files",',
    '    "search",',
    '    "search_files",',
    '  ],',
  ],
  author: 'promptfoo-scanner',
  badge: 'bot',
  date: 'on Oct 29',
  severity: 'High',
  finding:
    'The Information Agent has unrestricted Dropbox access with no approval gate. Instructions to “check all files first that you can see” could let a prompt injection retrieve sensitive files outside the customer service knowledge base.',
  details: [
    {
      label: 'Suggested Fix',
      text: 'Scope the Dropbox connector to the support knowledge base. Require approval before returning files outside that collection.',
    },
    {
      label: 'AI Agent Prompt',
      text: 'Update the Information Agent to enforce the support folder allowlist before fetching a file. Add a test that rejects a file outside the allowed folders.',
    },
  ],
};

export default function CodeReview({
  data = review,
  ...frame
}: FrameProps & { data?: typeof review }) {
  return (
    <PreviewFrame
      ratio={1592 / 1100}
      title={data.title}
      product={data.product}
      logo={<GitHubIcon sx={{ fontSize: 19 }} />}
      {...frame}
    >
      <div className={styles.review}>
        <div className={styles.filename}>{data.filename}</div>
        <div className={styles.diff}>
          {data.lines.map((line, i) => (
            <div key={i}>
              <span aria-hidden="true">{data.firstLine + i}</span>
              <code>
                <i aria-hidden="true">+ </i>
                {line}
              </code>
            </div>
          ))}
        </div>
        <div className={styles.comment}>
          <div className={styles.byline}>
            <img src="/img/logo-panda.svg" alt="" width="24" height="24" />
            <b>{data.author}</b>
            <span className={styles.tag}>{data.badge}</span>
            <small>{data.date}</small>
          </div>
          <strong className={styles.high}>{data.severity}</strong>
          <p>{data.finding}</p>
          {data.details.map((detail) => (
            <details key={detail.label}>
              <summary>{detail.label}</summary>
              <p>{detail.text}</p>
            </details>
          ))}
        </div>
      </div>
    </PreviewFrame>
  );
}
