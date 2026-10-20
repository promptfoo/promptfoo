import React from 'react';

import BlogPostCard from './BlogPostCard';
import styles from './BlogPostGrid.module.css';
import type { PropBlogPostContent } from '@docusaurus/plugin-content-blog';

interface BlogPostGridProps {
  posts: PropBlogPostContent[];
  title?: string;
  pageNumber?: number;
}

export default function BlogPostGrid({
  posts,
  title = 'Latest Posts',
  pageNumber,
}: BlogPostGridProps): React.ReactElement {
  const isPaginated = pageNumber !== undefined;

  return (
    <div className={styles.blogPostGridContainer}>
      <h2 className={styles.blogPostGridTitle} data-is-paginated={isPaginated}>
        {isPaginated ? `${title} ` : title}
        {isPaginated && <span className={styles.pageNumber}>{pageNumber}</span>}
      </h2>
      <div className={styles.blogPostGrid}>
        {posts.map((post) => (
          <BlogPostCard key={post.metadata.permalink} post={post} />
        ))}
      </div>
    </div>
  );
}
