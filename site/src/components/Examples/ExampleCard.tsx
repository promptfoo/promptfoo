import React from 'react';

import styles from './ExampleCard.module.css';

import type { ExampleData } from '../../data/examples';

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

interface ExampleCardProps {
  example: ExampleData;
  onClick: () => void;
}

export default function ExampleCard({ example, onClick }: ExampleCardProps): React.ReactElement {
  return (
    <button type="button" className={styles.card} onClick={onClick}>
      <div className={styles.header}>
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
      </div>

      <div className={styles.content}>
        <h3 className={styles.name}>{example.humanName}</h3>
        {example.description && <p className={styles.description}>{example.description}</p>}
        <code className={styles.slug}>{example.slug}</code>
      </div>

      <span className={styles.cta}>
        View details
        <svg
          className={styles.ctaIcon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M9 5l7 7-7 7" />
        </svg>
      </span>
    </button>
  );
}
