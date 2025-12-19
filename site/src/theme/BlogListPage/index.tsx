import React from 'react';

import { HtmlClassNameProvider, PageMetadata, ThemeClassNames } from '@docusaurus/theme-common';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import BlogPostGrid from '@site/src/components/Blog/BlogPostGrid';
import BlogLayout from '@theme/BlogLayout';
import BlogListPageStructuredData from '@theme/BlogListPage/StructuredData';
import BlogListPaginator from '@theme/BlogListPaginator';
import SearchMetadata from '@theme/SearchMetadata';
import clsx from 'clsx';
import styles from './styles.module.css';
import type { Props } from '@theme/BlogListPage';

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

// Curated featured posts data (edit these to change featured posts)
const FEATURED_POSTS = [
  {
    slug: 'building-a-security-scanner-for-llm-apps',
    title: 'Building a Security Scanner for LLM Apps',
    description:
      'We built a GitHub Action that scans pull requests for LLM-specific vulnerabilities. Learn why traditional security tools miss these issues and how we trace data flows to find prompt injection risks.',
    image: '/img/blog/building-a-security-scanner-for-llm-apps/call-graph-io-flows.png',
    permalink: '/blog/building-a-security-scanner-for-llm-apps/',
    date: '2025-12-16',
    author: 'Dane Schneider',
    tag: 'code-scanning',
  },
  {
    slug: 'asr-not-portable-metric',
    title: "Why Attack Success Rate (ASR) Isn't Comparable Across Jailbreak Papers",
    description:
      'Attack Success Rate (ASR) is the most commonly reported metric for LLM red teaming, but it changes with attempt budget, prompt sets, and judge choice.',
    image: '/img/blog/asr-not-portable-metric/asr-header.jpg',
    permalink: '/blog/asr-not-portable-metric/',
    date: '2025-12-12',
    author: "Michael D'Angelo",
    tag: 'research-analysis',
  },
];

function BlogListPageContent(props: Props): React.ReactElement {
  const { metadata, items, sidebar } = props;

  // Filter out featured posts from the grid on all pages
  const displayPosts = React.useMemo(() => {
    return items.filter(
      (item) => !FEATURED_POSTS.some((fp) => item.content.metadata.permalink.includes(fp.slug)),
    );
  }, [items]);

  return (
    <BlogLayout sidebar={sidebar}>
      <div className={styles.blogListPage}>
        <div className={styles.featuredSection}>
          {FEATURED_POSTS.map((post, idx) => (
            <FeaturedBlogPostStatic key={idx} post={post} />
          ))}
        </div>
        <BlogPostGrid posts={displayPosts.map((item) => item.content)} title="Latest Posts" />
      </div>
      <BlogListPaginator metadata={metadata} />
    </BlogLayout>
  );
}

// Static featured post component for curated posts
function FeaturedBlogPostStatic({
  post,
}: {
  post: (typeof FEATURED_POSTS)[0];
}): React.ReactElement {
  const formattedDate = new Date(post.date).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <a href={post.permalink} className={styles.featuredPostLink}>
      <div className={styles.featuredPost}>
        <div className={styles.featuredBadge}>Featured</div>
        <div className={styles.featuredPostImage}>
          <img src={post.image} alt={post.title} loading="lazy" />
        </div>
        <div className={styles.featuredPostContent}>
          <div className={styles.featuredPostHeader}>
            <span className={styles.tag}>{post.tag}</span>
            <h2 className={styles.featuredTitle}>{post.title}</h2>
          </div>
          <p className={styles.preview}>{post.description}</p>
          <div className={styles.featuredPostMeta}>
            <span className={styles.author}>
              {post.author} · {formattedDate}
            </span>
          </div>
        </div>
      </div>
    </a>
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
