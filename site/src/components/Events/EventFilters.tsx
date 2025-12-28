import React from 'react';

import styles from './EventFilters.module.css';

import type { EventStatus } from '../../data/events';

export type FilterStatus = EventStatus | 'all';
export type FilterYear = number | 'all';

interface EventFiltersProps {
  selectedStatus: FilterStatus;
  selectedYear: FilterYear;
  availableYears: number[];
  onStatusChange: (status: FilterStatus) => void;
  onYearChange: (year: FilterYear) => void;
  eventCounts: {
    all: number;
    upcoming: number;
    past: number;
  };
}

export default function EventFilters({
  selectedStatus,
  selectedYear,
  availableYears,
  onStatusChange,
  onYearChange,
  eventCounts,
}: EventFiltersProps): React.ReactElement {
  return (
    <div className={styles.filters}>
      {/* Status Filter */}
      <div className={styles.filterGroup}>
        <span className={styles.filterLabel}>Status</span>
        <div className={styles.filterButtons}>
          <button
            className={`${styles.filterButton} ${selectedStatus === 'all' ? styles.active : ''}`}
            onClick={() => onStatusChange('all')}
            type="button"
          >
            All
            <span className={styles.count}>{eventCounts.all}</span>
          </button>
          <button
            className={`${styles.filterButton} ${selectedStatus === 'upcoming' ? styles.active : ''}`}
            onClick={() => onStatusChange('upcoming')}
            type="button"
          >
            Upcoming
            <span className={styles.count}>{eventCounts.upcoming}</span>
          </button>
          <button
            className={`${styles.filterButton} ${selectedStatus === 'past' ? styles.active : ''}`}
            onClick={() => onStatusChange('past')}
            type="button"
          >
            Past
            <span className={styles.count}>{eventCounts.past}</span>
          </button>
        </div>
      </div>

      {/* Year Filter */}
      <div className={styles.filterGroup}>
        <span className={styles.filterLabel}>Year</span>
        <div className={styles.filterButtons}>
          <button
            className={`${styles.filterButton} ${selectedYear === 'all' ? styles.active : ''}`}
            onClick={() => onYearChange('all')}
            type="button"
          >
            All Years
          </button>
          {availableYears.map((year) => (
            <button
              key={year}
              className={`${styles.filterButton} ${selectedYear === year ? styles.active : ''}`}
              onClick={() => onYearChange(year)}
              type="button"
            >
              {year}
            </button>
          ))}
        </div>
      </div>

      {/* Clear Filters */}
      {(selectedStatus !== 'all' || selectedYear !== 'all') && (
        <button
          className={styles.clearButton}
          onClick={() => {
            onStatusChange('all');
            onYearChange('all');
          }}
          type="button"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
