import React from 'react';

import Link from '@docusaurus/Link';
import styles from './styles.module.css';
import type { Props } from '@theme/BlogListPaginator';

export default function BlogListPaginator(props: Props): React.ReactElement {
  const { metadata } = props;
  const { previousPage, nextPage } = metadata;

  return (
    <nav className={styles.pagination} aria-label="Blog list page navigation">
      <div className={styles.paginationNav}>
        {previousPage && (
          <Link className={styles.paginationNavLink} to={previousPage}>
            <span className={styles.paginationNavLabel}>
              <span className={styles.paginationNavArrow}>←</span>
              Previous Page
            </span>
          </Link>
        )}
        {nextPage && (
          <Link
            className={`${styles.paginationNavLink} ${styles.paginationNavLinkNext}`}
            to={nextPage}
          >
            <span className={styles.paginationNavLabel}>
              Next Page
              <span className={styles.paginationNavArrow}>→</span>
            </span>
          </Link>
        )}
      </div>
    </nav>
  );
}
