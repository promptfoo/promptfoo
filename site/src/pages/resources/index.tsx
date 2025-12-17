import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type FilterState,
  QuickLinks,
  ResourceFilters,
  ResourceGrid,
} from '../../components/Resources';
import {
  filterResources,
  getCategoryCounts,
  type ResourceCategory,
} from '../../data/resources';
import styles from './index.module.css';

function getInitialFilters(): FilterState {
  if (typeof window === 'undefined') {
    return { search: '', category: 'all' };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    search: params.get('q') || '',
    category: (params.get('category') as ResourceCategory | 'all') || 'all',
  };
}

export default function ResourcesPage(): React.ReactElement {
  const [filters, setFilters] = useState<FilterState>(getInitialFilters);
  const counts = useMemo(() => getCategoryCounts(), []);

  // Sync filters with URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.search) {
      params.set('q', filters.search);
    }
    if (filters.category !== 'all') {
      params.set('category', filters.category);
    }

    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;

    window.history.replaceState({}, '', newUrl);
  }, [filters]);

  const handleFiltersChange = useCallback((newFilters: FilterState) => {
    setFilters(newFilters);
  }, []);

  const filteredResources = useMemo(
    () => filterResources(filters.category, filters.search),
    [filters],
  );

  return (
    <Layout
      title="Resources | Promptfoo"
      description="Guides, security research, and tutorials for testing and securing LLM applications."
    >
      <main className={styles.main}>
        <div className={styles.container}>
          {/* Header Section */}
          <header className={styles.header}>
            <h1 className={styles.title}>Resources</h1>
            <p className={styles.subtitle}>
              Guides, security research, and tutorials for testing and securing LLM applications.
            </p>
            <div className={styles.ctaContainer}>
              <Link to="/docs/red-team/quickstart/" className={styles.ctaPrimary}>
                Get started with red teaming
              </Link>
              <Link to="/contact/" className={styles.ctaSecondary}>
                Book a demo
              </Link>
            </div>
          </header>

          {/* Filter Section */}
          <ResourceFilters
            filters={filters}
            onChange={handleFiltersChange}
            counts={counts}
          />

          {/* Results Grid */}
          <ResourceGrid resources={filteredResources} />

          {/* Quick Links */}
          <QuickLinks />

          {/* CTA Band */}
          <section className={styles.ctaBand} aria-labelledby="cta-title">
            <div className={styles.ctaBandContent}>
              <h2 id="cta-title" className={styles.ctaBandTitle}>
                Ready to secure your AI?
              </h2>
              <div className={styles.ctaBandButtons}>
                <Link to="/contact/" className={styles.ctaBandButtonPrimary}>
                  Book a demo
                </Link>
                <Link to="/docs/getting-started/" className={styles.ctaBandButtonSecondary}>
                  Try the CLI
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>
    </Layout>
  );
}
