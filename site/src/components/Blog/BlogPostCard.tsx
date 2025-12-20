import React from 'react';

import Link from '@docusaurus/Link';
import styles from './BlogPostCard.module.css';
import type { PropBlogPostContent } from '@docusaurus/plugin-content-blog';

// Format tag label: "red-teaming" → "Red Teaming", "ai-security" → "AI Security"
function formatTagLabel(label: string): string {
  const acronyms = ['ai', 'llm', 'owasp', 'mcp', 'rag', 'agi', 'a2a', 'eu'];
  return label
    .split('-')
    .map((word) => {
      if (acronyms.includes(word.toLowerCase())) {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

interface BlogPostCardProps {
  post: PropBlogPostContent;
}

export default function BlogPostCard({ post }: BlogPostCardProps): React.ReactElement {
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

  // Get first sentence of description for preview
  const preview = description ? description.split('. ')[0] + '.' : null;

  return (
    <Link to={permalink} className={styles.blogPostCard}>
      {metadata.frontMatter.image && (
        <div className={styles.blogPostImage}>
          <img src={metadata.frontMatter.image} alt={title} loading="lazy" />
        </div>
      )}
      <div className={styles.blogPostContent}>
        {primaryTag && <span className={styles.tag}>{formatTagLabel(primaryTag.label)}</span>}
        <h3 className={styles.title}>{title}</h3>
        {preview && <p className={styles.preview}>{preview}</p>}
        <div className={styles.blogPostMeta}>
          {author && <span className={styles.author}>{author.name}</span>}
          <span className={styles.date}>{formattedDate}</span>
        </div>
      </div>
    </Link>
  );
}
