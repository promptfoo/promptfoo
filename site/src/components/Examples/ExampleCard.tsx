import React from 'react';

import styles from './ExampleCard.module.css';
import { TAG_COLORS } from './tagColors';

import type { ExampleData } from '../../data/examples';

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
