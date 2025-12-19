import React from 'react';
import Link from '@docusaurus/Link';
import type { PropBlogPostContent } from '@docusaurus/plugin-content-blog';
import styles from './FeaturedBlogPost.module.css';

interface FeaturedBlogPostProps {
  post: PropBlogPostContent;
}

export default function FeaturedBlogPost({ post }: FeaturedBlogPostProps): React.ReactElement {
  const { metadata } = post;
  const { title, date, permalink, tags, description } = metadata;
  const author = metadata.authors[0];

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
    <Link to={permalink} className={styles.featuredPostLink}>
      <div className={styles.featuredPost}>
        <div className={styles.featuredBadge}>Featured</div>
        {metadata.frontMatter.image && (
          <div className={styles.featuredPostImage}>
            <img src={metadata.frontMatter.image} alt={title} loading="lazy" />
          </div>
        )}
        <div className={styles.featuredPostContent}>
          <div className={styles.featuredPostHeader}>
            {primaryTag && <span className={styles.tag}>{primaryTag.label}</span>}
            <h2 className={styles.title}>{title}</h2>
          </div>
          {description && (
            <p className={styles.preview}>{description.split('. ').slice(0, 2).join('. ')}.</p>
          )}
          <div className={styles.featuredPostMeta}>
            {author && (
              <span className={styles.author}>
                {author.name} · {formattedDate}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
