import React from 'react';
import Link from '@docusaurus/Link';
import type { PropBlogPostContent } from '@docusaurus/plugin-content-blog';
import styles from './BlogPostCard.module.css';

interface BlogPostCardProps {
  post: PropBlogPostContent;
}

export default function BlogPostCard({ post }: BlogPostCardProps): React.ReactElement {
  const { metadata } = post;
  const { title, date, permalink, tags } = metadata;

  // Format date as "Dec 12, 2025" style
  const formattedDate = new Date(date).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // Get the first tag if available
  const primaryTag = tags && tags.length > 0 ? tags[0] : null;

  return (
    <Link to={permalink} className={styles.blogPostCard}>
      {metadata.frontMatter.image && (
        <div className={styles.blogPostImage}>
          <img src={metadata.frontMatter.image} alt={title} loading="lazy" />
        </div>
      )}
      <div className={styles.blogPostContent}>
        {primaryTag && <span className={styles.tag}>{primaryTag.label}</span>}
        <h3 className={styles.title}>{title}</h3>
        <div className={styles.blogPostMeta}>
          <span className={styles.date}>{formattedDate}</span>
        </div>
      </div>
    </Link>
  );
}
