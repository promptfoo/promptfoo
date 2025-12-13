import React from 'react';
import Link from '@docusaurus/Link';
import type { PropBlogPostContent } from '@docusaurus/plugin-content-blog';
import styles from './BlogPostCard.module.css';

interface BlogPostCardProps {
  post: PropBlogPostContent;
}

export default function BlogPostCard({ post }: BlogPostCardProps): React.ReactElement {
  const { metadata } = post;
  const { title, date, permalink, tags, description } = metadata;
  const author = metadata.authors[0];

  // Format date with UTC timezone to avoid timezone conversion issues
  const formattedDate = new Date(date).toLocaleDateString(undefined, {
    timeZone: 'UTC',
  });

  return (
    <Link to={permalink} className={styles.blogPostCard}>
      {metadata.frontMatter.image && (
        <div className={styles.blogPostImage}>
          <img src={metadata.frontMatter.image} alt={title} />
        </div>
      )}
      <div className={styles.blogPostContent}>
        {/*tags && tags.length > 0 && <div className={styles.tag}>{tags[0].label}</div>*/}
        <h3 className={styles.title}>{title}</h3>
        <div className={styles.blogPostMeta}>
          {author && (
            <span className={styles.author}>
              {author.name} · {formattedDate}
            </span>
          )}
        </div>
        {description && <p className={styles.preview}>{description.split('. ')[0]}.</p>}
      </div>
    </Link>
  );
}
