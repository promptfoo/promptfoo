import React, { useCallback, useMemo, useState } from 'react';

import Drawer from '@mui/material/Drawer';
import styles from './ExampleDrawer.module.css';

import type { ExampleData } from '../../data/examples';

type InstallMethod = 'npx' | 'npm' | 'brew';

const TAG_COLORS: Record<string, string> = {
  'Getting Started': '#16a34a',
  Configuration: '#2563eb',
  Evaluation: '#7c3aed',
  'Model Comparison': '#d97706',
  'Red Teaming': '#dc2626',
  Integrations: '#0891b2',
  OpenAI: '#475569',
  Providers: '#9333ea',
  Agents: '#059669',
  Multimodal: '#c026d3',
  'Tool Use': '#0d9488',
  RAG: '#4f46e5',
  MCP: '#ea580c',
  Audio: '#0284c7',
  'Structured Output': '#6d28d9',
};

interface ExampleDrawerProps {
  example: ExampleData | null;
  open: boolean;
  onClose: () => void;
}

function getCommand(slug: string, method: InstallMethod): string {
  switch (method) {
    case 'npx':
      return `npx promptfoo@latest init --example ${slug}`;
    case 'npm':
      return `promptfoo init --example ${slug}`;
    case 'brew':
      return `promptfoo init --example ${slug}`;
  }
}

export default function ExampleDrawer({
  example,
  open,
  onClose,
}: ExampleDrawerProps): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const [installMethod, setInstallMethod] = useState<InstallMethod>('npx');

  const command = useMemo(
    () => (example ? getCommand(example.slug, installMethod) : ''),
    [example, installMethod],
  );

  const handleCopy = useCallback(() => {
    if (!command) {
      return;
    }
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [command]);

  if (!example) {
    return null;
  }

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        className: styles.paper,
      }}
    >
      <div className={styles.drawer}>
        {/* Header */}
        <div className={styles.header}>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className={styles.content}>
          <div className={styles.tags}>
            {example.tags.map((tag) => (
              <span
                key={tag}
                className={styles.badge}
                style={{ backgroundColor: TAG_COLORS[tag] || '#6b7280' }}
              >
                {tag}
              </span>
            ))}
          </div>

          <h2 className={styles.name}>{example.humanName}</h2>

          {example.description && <p className={styles.description}>{example.description}</p>}

          {/* Init command */}
          <div className={styles.commandSection}>
            <span className={styles.commandLabel}>Get started</span>
            <div className={styles.methodTabs}>
              {(['npx', 'npm', 'brew'] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  className={`${styles.methodTab} ${installMethod === method ? styles.methodTabActive : ''}`}
                  onClick={() => setInstallMethod(method)}
                >
                  {method}
                </button>
              ))}
            </div>
            <div className={styles.commandBox}>
              <code className={styles.commandText}>{command}</code>
              <button type="button" className={styles.copyButton} onClick={handleCopy}>
                {copied ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className={styles.actions}>
            <a
              href={example.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.githubButton}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className={styles.githubIcon}>
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              View on GitHub
            </a>
          </div>
        </div>
      </div>
    </Drawer>
  );
}
