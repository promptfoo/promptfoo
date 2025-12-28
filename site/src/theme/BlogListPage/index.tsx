import React from 'react';

import Link from '@docusaurus/Link';
import { HtmlClassNameProvider, PageMetadata, ThemeClassNames } from '@docusaurus/theme-common';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import BlogPostGrid from '@site/src/components/Blog/BlogPostGrid';
import BlogLayout from '@theme/BlogLayout';
import BlogListPageStructuredData from '@theme/BlogListPage/StructuredData';
import BlogListPaginator from '@theme/BlogListPaginator';
import SearchMetadata from '@theme/SearchMetadata';
import clsx from 'clsx';
import styles from './styles.module.css';
import type { PropBlogPostContent } from '@docusaurus/plugin-content-blog';
import type { Props } from '@theme/BlogListPage';

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

function BlogListPageMetadata(props: Props): React.ReactElement {
  const { metadata } = props;
  const {
    siteConfig: { title: siteTitle },
  } = useDocusaurusContext();
  const { blogDescription, blogTitle, permalink } = metadata;
  const isBlogOnlyMode = permalink === '/';
  const title = isBlogOnlyMode ? siteTitle : blogTitle;
  const image =
    props.items[0]?.content.frontMatter?.image || 'https://www.promptfoo.dev/img/thumbnail.png';
  return (
    <>
      <PageMetadata title={title} description={blogDescription} image={image} />
      <SearchMetadata tag="blog_posts_list" />
    </>
  );
}

function BlogListPageContent(props: Props): React.ReactElement {
  const { metadata, items, sidebar } = props;
  const isFirstPage = metadata.page === 1;

  // Find featured posts from frontmatter (posts with featured: true)
  const featuredPosts = React.useMemo(() => {
    if (!isFirstPage) {
      return [];
    }
    return items
      .filter((item) => (item.content.frontMatter as { featured?: boolean }).featured === true)
      .map((item) => item.content);
  }, [items, isFirstPage]);

  // Filter out featured posts from the grid only on page 1
  const displayPosts = React.useMemo(() => {
    if (!isFirstPage) {
      return items;
    }
    return items.filter(
      (item) => (item.content.frontMatter as { featured?: boolean }).featured !== true,
    );
  }, [items, isFirstPage]);

  // Dynamic title based on page (use • to match BlogPostGrid parsing)
  const gridTitle = isFirstPage ? 'Latest Posts' : `Older Posts • Page ${metadata.page}`;

  return (
    <BlogLayout sidebar={sidebar}>
      <div className={styles.blogListPage}>
        {isFirstPage && featuredPosts.length > 0 && (
          <div className={styles.featuredSection}>
            {featuredPosts.map((post) => (
              <FeaturedBlogPost key={post.metadata.permalink} post={post} />
            ))}
          </div>
        )}
        <BlogPostGrid posts={displayPosts.map((item) => item.content)} title={gridTitle} />
      </div>
      <BlogListPaginator metadata={metadata} />
    </BlogLayout>
  );
}

// Featured post component using actual blog post data
function FeaturedBlogPost({ post }: { post: PropBlogPostContent }): React.ReactElement {
  const { metadata } = post;
  const { title, date, permalink, tags, description } = metadata;
  const author = metadata.authors[0];

  const formattedDate = new Date(date).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // Get the first tag if available
  const primaryTag = tags && tags.length > 0 ? tags[0] : null;

  // Truncate description to first 2 sentences for preview
  const previewDescription = description
    ? description.split('. ').slice(0, 2).join('. ') + (description.includes('. ') ? '.' : '')
    : null;

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
            {primaryTag && <span className={styles.tag}>{formatTagLabel(primaryTag.label)}</span>}
            <h2 className={styles.featuredTitle}>{title}</h2>
          </div>
          {previewDescription && <p className={styles.preview}>{previewDescription}</p>}
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

export default function BlogListPage(props: Props): React.ReactElement {
  return (
    <HtmlClassNameProvider
      className={clsx(ThemeClassNames.wrapper.blogPages, ThemeClassNames.page.blogListPage)}
    >
      <BlogListPageMetadata {...props} />
      <BlogListPageStructuredData {...props} />
      <BlogListPageContent {...props} />
    </HtmlClassNameProvider>
  );
}
