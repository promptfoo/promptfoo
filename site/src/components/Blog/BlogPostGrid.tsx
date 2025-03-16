import React from 'react';
import type { PropBlogPostContent } from '@docusaurus/plugin-content-blog';
import BlogPostCard from './BlogPostCard';
import styles from './BlogPostGrid.module.css';

interface BlogPostGridProps {
  posts: PropBlogPostContent[];
}

export default function BlogPostGrid({ posts }: BlogPostGridProps): JSX.Element {
  return (
    <div className={styles.blogPostGridContainer}>
      <h2 className={styles.blogPostGridTitle}>Latest Posts</h2>
      <div className={styles.blogPostGrid}>
        {posts.map((post, idx) => (
          <BlogPostCard key={idx} post={post} />
        ))}
      </div>
    </div>
  );
}
