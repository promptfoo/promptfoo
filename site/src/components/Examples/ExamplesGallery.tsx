import React, { useEffect, useMemo, useState } from 'react';

import Link from '@docusaurus/Link';
import { useLocation } from '@docusaurus/router';
import { type ExampleData, searchExamples, tags, totalCount } from '../../data/examples';
import styles from './ExamplesGallery.module.css';
import { ExampleCard, ExampleDrawer, ExampleFilters } from './index';

export default function ExamplesGallery(): React.ReactElement {
  const location = useLocation();

  const [searchQuery, setSearchQuery] = useState(() => {
    const params = new URLSearchParams(location.search);
    return params.get('q') || '';
  });
  const [selectedTag, setSelectedTag] = useState(() => {
    const params = new URLSearchParams(location.search);
    return params.get('tag') || 'all';
  });
  const [selectedExample, setSelectedExample] = useState<ExampleData | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (searchQuery) {
      params.set('q', searchQuery);
    }
    if (selectedTag !== 'all') {
      params.set('tag', selectedTag);
    }
    const search = params.toString();
    const newUrl = search ? `${location.pathname}?${search}` : location.pathname;
    window.history.replaceState(null, '', newUrl);
  }, [searchQuery, selectedTag, location.pathname]);

  const filteredExamples = useMemo(
    () => searchExamples(searchQuery, selectedTag),
    [searchQuery, selectedTag],
  );

  return (
    <div className={styles.gallery}>
      <p className={styles.subtitle}>
        Browse {totalCount} ready-to-use configurations for evaluations, red teaming, providers, and
        more.
      </p>

      <ExampleFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedTag={selectedTag}
        onTagChange={setSelectedTag}
        tags={tags}
        resultCount={filteredExamples.length}
        totalCount={totalCount}
      />

      {filteredExamples.length > 0 ? (
        <div className={styles.grid}>
          {filteredExamples.map((example) => (
            <ExampleCard
              key={example.slug}
              example={example}
              onClick={() => {
                setSelectedExample(example);
                setDrawerOpen(true);
              }}
            />
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <p>No examples found matching your search.</p>
          <button
            type="button"
            className={styles.resetButton}
            onClick={() => {
              setSearchQuery('');
              setSelectedTag('all');
            }}
          >
            Clear filters
          </button>
        </div>
      )}

      <section className={styles.cta}>
        <div className={styles.ctaContent}>
          <h2 className={styles.ctaTitle}>Want to contribute?</h2>
          <p className={styles.ctaDescription}>
            Add your own example to help the community learn and test new patterns.
          </p>
          <Link
            to="https://github.com/promptfoo/promptfoo/tree/main/examples"
            className={styles.ctaButton}
          >
            View on GitHub
          </Link>
        </div>
      </section>

      <ExampleDrawer
        example={selectedExample}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
