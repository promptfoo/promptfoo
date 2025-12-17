import Link from '@docusaurus/Link';
import type React from 'react';
import {
  getCategoryLabel,
  getCtaText,
  getMetaText,
  type Resource,
} from '../../data/resources';
import styles from './ResourceCard.module.css';

interface ResourceCardProps {
  resource: Resource;
}

export default function ResourceCard({ resource }: ResourceCardProps): React.ReactElement {
  const categoryLabel = getCategoryLabel(resource.category);
  const ctaText = getCtaText(resource);
  const metaText = getMetaText(resource);

  const CardContent = (
    <>
      <div className={styles.cardHeader}>
        <span className={`${styles.categoryBadge} ${styles[resource.category.replace('-', '')]}`}>
          {categoryLabel}
        </span>
        {resource.isExternal && (
          <span className={styles.externalIndicator} aria-label="External link">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </span>
        )}
      </div>

      <h3 className={styles.cardTitle}>{resource.title}</h3>

      <p className={styles.cardDescription}>{resource.description}</p>

      {metaText && <p className={styles.cardMeta}>{metaText}</p>}

      <span className={styles.cardCta}>
        {ctaText}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </span>
    </>
  );

  if (resource.isExternal) {
    return (
      <a
        href={resource.url}
        className={styles.card}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${resource.title} (opens in new tab)`}
      >
        {CardContent}
      </a>
    );
  }

  return (
    <Link to={resource.url} className={styles.card}>
      {CardContent}
    </Link>
  );
}
