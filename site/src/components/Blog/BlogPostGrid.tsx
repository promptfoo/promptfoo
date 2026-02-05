import React from 'react';

import BlogPostCard from './BlogPostCard';
import styles from './BlogPostGrid.module.css';
import type { PropBlogPostContent } from '@docusaurus/plugin-content-blog';

interface BlogPostGridProps {
  posts: PropBlogPostContent[];
  title?: string;
}

export default function BlogPostGrid({
  posts,
  title = 'Latest Posts',
}: BlogPostGridProps): React.ReactElement {
  // Check if this is a paginated page (not the first page)
  const isPaginatedPage = title.includes('Older Posts');

  // If it's a paginated page, split the title to style the page number separately
  let mainTitle = title;
  let pageNumber = null;

  if (isPaginatedPage) {
    const titleParts = title.split('•');
    mainTitle = titleParts[0].trim();

    // Extract page number from the second part
    if (titleParts.length > 1) {
      const pageText = titleParts[1].trim();
      const pageNum = pageText.replace('Page ', '');

      pageNumber = <span className={styles.pageNumber}>{pageNum}</span>;
    }
  }

  return (
    <div className={styles.blogPostGridContainer}>
      <h2 className={styles.blogPostGridTitle} data-is-paginated={isPaginatedPage}>
        {mainTitle}
        {pageNumber}
      </h2>
      <div className={styles.blogPostGrid}>
        {posts.map((post, idx) => (
          <BlogPostCard key={idx} post={post} />
        ))}
      </div>
    </div>
  );
}
