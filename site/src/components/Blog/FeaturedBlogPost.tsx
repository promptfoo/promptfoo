import React from 'react';
import Link from '@docusaurus/Link';
import type { PropBlogPostContent } from '@docusaurus/plugin-content-blog';
import styles from './FeaturedBlogPost.module.css';

interface FeaturedBlogPostProps {
  post: PropBlogPostContent;
}

export default function FeaturedBlogPost({ post }: FeaturedBlogPostProps): JSX.Element {
  const { metadata } = post;
  const { title, date, permalink, tags, description } = metadata;
  const author = metadata.authors[0];

  return (
    <Link to={permalink} className={styles.featuredPostLink}>
      <div className={styles.featuredPost}>
        <div className={styles.featuredPostContent}>
          <div className={styles.featuredPostHeader}>
            {tags && tags.length > 0 && <div className={styles.tag}>{tags[0].label}</div>}
            <h2 className={styles.title}>{title}</h2>
          </div>
          <div className={styles.featuredPostMeta}>
            {author && (
              <span className={styles.author}>
                {author.name} · {new Date(date).toLocaleDateString()}
              </span>
            )}
          </div>
          {description && (
            <p className={styles.preview}>{description.split('. ').slice(0, 2).join('. ')}.</p>
          )}
        </div>
        {metadata.frontMatter.image && (
          <div className={styles.featuredPostImage}>
            <img src={metadata.frontMatter.image} alt={title} />
          </div>
        )}
      </div>
    </Link>
  );
}
