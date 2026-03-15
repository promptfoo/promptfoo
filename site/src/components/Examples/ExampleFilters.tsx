import React from 'react';

import styles from './ExampleFilters.module.css';

import type { ExampleTag } from '../../data/examples';

interface ExampleFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedTag: string;
  onTagChange: (tag: string) => void;
  tags: ExampleTag[];
  resultCount: number;
  totalCount: number;
}

export default function ExampleFilters({
  searchQuery,
  onSearchChange,
  selectedTag,
  onTagChange,
  tags,
  resultCount,
  totalCount,
}: ExampleFiltersProps): React.ReactElement {
  const hasActiveFilters = searchQuery !== '' || selectedTag !== 'all';

  return (
    <div className={styles.filters}>
      {/* Search */}
      <div className={styles.searchGroup}>
        <div className={styles.searchWrapper}>
          <svg
            className={styles.searchIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search examples..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className={styles.clearSearch}
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Tag Filter */}
      <div className={styles.filterGroup} role="group" aria-label="Filter by tag">
        <div className={styles.filterButtons}>
          <button
            className={`${styles.filterButton} ${selectedTag === 'all' ? styles.active : ''}`}
            onClick={() => onTagChange('all')}
            type="button"
          >
            All
            <span className={styles.count}>{totalCount}</span>
          </button>
          {tags.map((tag) => (
            <button
              key={tag.id}
              className={`${styles.filterButton} ${selectedTag === tag.label ? styles.active : ''}`}
              onClick={() => onTagChange(tag.label)}
              type="button"
            >
              {tag.label}
              <span className={styles.count}>{tag.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Results count and clear */}
      <div className={styles.resultBar}>
        <span className={styles.resultCount}>
          {hasActiveFilters
            ? `Showing ${resultCount} of ${totalCount} examples`
            : `${totalCount} examples`}
        </span>
        {hasActiveFilters && (
          <button
            className={styles.clearButton}
            onClick={() => {
              onSearchChange('');
              onTagChange('all');
            }}
            type="button"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
