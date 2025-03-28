import React from 'react';
import type { PropBlogPostContent } from '@docusaurus/plugin-content-blog';
import BlogPostCard from './BlogPostCard';
import styles from './BlogPostGrid.module.css';

interface BlogPostGridProps {
  posts: PropBlogPostContent[];
  title?: string;
}

export default function BlogPostGrid({
  posts,
  title = 'Latest Posts',
}: BlogPostGridProps): JSX.Element {
  // Check if this is an archive page
  const isArchivePage = title.includes('Archive');

  // If it's an archive page, split the title to style the page number separately
  let mainTitle = title;
  let pageNumber = null;

  if (isArchivePage) {
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
      <h2 className={styles.blogPostGridTitle} data-is-archive={isArchivePage}>
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
