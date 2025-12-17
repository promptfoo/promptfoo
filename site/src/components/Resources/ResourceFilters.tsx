import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { getCategoryLabel, type ResourceCategory } from '../../data/resources';
import styles from './ResourceFilters.module.css';

export interface FilterState {
  search: string;
  category: ResourceCategory | 'all';
}

interface ResourceFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  counts: Record<ResourceCategory | 'all', number>;
}

const CATEGORIES: Array<ResourceCategory | 'all'> = [
  'all',
  'getting-started',
  'security-research',
  'courses',
  'community',
];

export default function ResourceFilters({
  filters,
  onChange,
  counts,
}: ResourceFiltersProps): React.ReactElement {
  const [searchValue, setSearchValue] = useState(filters.search);
  const [isMobile, setIsMobile] = useState(false);

  // Check for mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Debounce search input
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchValue !== filters.search) {
        onChange({ ...filters, search: searchValue });
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchValue, filters, onChange]);

  const handleCategoryChange = useCallback(
    (category: ResourceCategory | 'all') => {
      onChange({ ...filters, category });
    },
    [filters, onChange],
  );

  const handleClearFilters = useCallback(() => {
    setSearchValue('');
    onChange({ search: '', category: 'all' });
  }, [onChange]);

  const hasActiveFilters = filters.search || filters.category !== 'all';

  return (
    <div className={styles.filterContainer}>
      {/* Search Input */}
      <div className={styles.searchWrapper}>
        <svg
          className={styles.searchIcon}
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search resources..."
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          aria-label="Search resources"
        />
        {searchValue && (
          <button
            type="button"
            className={styles.clearSearch}
            onClick={() => setSearchValue('')}
            aria-label="Clear search"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Category Filter - Tabs on desktop, dropdown on mobile */}
      {isMobile ? (
        <select
          className={styles.filterDropdown}
          value={filters.category}
          onChange={(e) => handleCategoryChange(e.target.value as ResourceCategory | 'all')}
          aria-label="Filter by category"
        >
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category === 'all' ? 'All' : getCategoryLabel(category)} ({counts[category]})
            </option>
          ))}
        </select>
      ) : (
        <div className={styles.filterTabs} role="tablist" aria-label="Filter by category">
          {CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              role="tab"
              className={`${styles.filterTab} ${filters.category === category ? styles.active : ''}`}
              onClick={() => handleCategoryChange(category)}
              aria-selected={filters.category === category}
            >
              {category === 'all' ? 'All' : getCategoryLabel(category)}
              <span className={styles.filterCount}>{counts[category]}</span>
            </button>
          ))}
        </div>
      )}

      {/* Clear Filters */}
      {hasActiveFilters && (
        <div className={styles.activeFilters}>
          <button
            type="button"
            className={styles.clearFilters}
            onClick={handleClearFilters}
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}
