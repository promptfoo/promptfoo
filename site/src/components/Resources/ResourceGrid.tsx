import type React from 'react';
import type { Resource } from '../../data/resources';
import ResourceCard from './ResourceCard';
import styles from './ResourceGrid.module.css';

interface ResourceGridProps {
  resources: Resource[];
  isLoading?: boolean;
}

function SkeletonCard(): React.ReactElement {
  return (
    <div className={styles.skeletonCard}>
      <div className={styles.skeletonBadge} />
      <div className={styles.skeletonTitle} />
      <div className={styles.skeletonDescription} />
      <div className={styles.skeletonMeta} />
    </div>
  );
}

function EmptyState(): React.ReactElement {
  return (
    <div className={styles.emptyState}>
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={styles.emptyIcon}
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <h3 className={styles.emptyTitle}>No resources found</h3>
      <p className={styles.emptyDescription}>
        Try a different search or clear your filters.
      </p>
    </div>
  );
}

export default function ResourceGrid({
  resources,
  isLoading = false,
}: ResourceGridProps): React.ReactElement {
  if (isLoading) {
    return (
      <div className={styles.grid} aria-busy="true" aria-label="Loading resources">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (resources.length === 0) {
    return <EmptyState />;
  }

  return (
    <section aria-label="Resources list">
      <p className={styles.resultsCount} aria-live="polite">
        Showing {resources.length} resource{resources.length !== 1 ? 's' : ''}
      </p>
      <div className={styles.grid} role="list">
        {resources.map((resource) => (
          <div key={resource.id} role="listitem">
            <ResourceCard resource={resource} />
          </div>
        ))}
      </div>
    </section>
  );
}
