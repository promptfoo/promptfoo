import React from 'react';
import { PageMetadata, HtmlClassNameProvider, ThemeClassNames } from '@docusaurus/theme-common';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import BlogLayout from '@theme/BlogLayout';
import type { Props } from '@theme/BlogListPage';
import BlogListPageStructuredData from '@theme/BlogListPage/StructuredData';
import BlogListPaginator from '@theme/BlogListPaginator';
import SearchMetadata from '@theme/SearchMetadata';
import Link from '@docusaurus/Link';
import clsx from 'clsx';
import styles from './styles.module.css';

function BlogListPageMetadata(props: Props): JSX.Element {
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

function BlogListPageContent(props: Props): JSX.Element {
  const { metadata, items, sidebar } = props;
  const isFirstPage = metadata.page === 1;

  // Format tag label helper
  const formatTagLabel = (label: string) => {
    return label
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Hero post (first post on first page)
  const heroPost = isFirstPage && items.length > 0 ? items[0] : null;
  const remainingPosts = isFirstPage ? items.slice(1) : items;

  return (
    <BlogLayout sidebar={sidebar}>
      <div className={styles.blogContainer}>
        {/* Hero Section - First Page Only */}
        {heroPost && (
          <Link to={heroPost.content.metadata.permalink} className={styles.heroLink}>
            <article className={styles.heroPost}>
              {heroPost.content.metadata.frontMatter.image && (
                <div className={styles.heroImage}>
                  <img 
                    src={heroPost.content.metadata.frontMatter.image} 
                    alt={heroPost.content.metadata.title}
                  />
                </div>
              )}
              <div className={styles.heroContent}>
                {heroPost.content.metadata.tags?.[0] && (
                  <span className={styles.heroTag}>
                    {formatTagLabel(heroPost.content.metadata.tags[0].label)}
                  </span>
                )}
                <h1 className={styles.heroTitle}>
                  {heroPost.content.metadata.title}
                </h1>
                <p className={styles.heroDescription}>
                  {heroPost.content.metadata.description}
                </p>
                <div className={styles.heroMeta}>
                  {heroPost.content.metadata.authors?.[0]?.name} · {' '}
                  {new Date(heroPost.content.metadata.date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                  {heroPost.content.metadata.readingTime && (
                    <> · {Math.ceil(heroPost.content.metadata.readingTime)} min read</>
                  )}
                </div>
              </div>
            </article>
          </Link>
        )}

        {/* Regular Posts Grid */}
        {remainingPosts.length > 0 && (
          <div className={styles.postsSection}>
            <h2 className={styles.sectionTitle}>
              {isFirstPage ? 'Recent Posts' : `Archive · Page ${metadata.page}`}
            </h2>
            <div className={styles.postsGrid}>
              {remainingPosts.map((item, idx) => {
                const post = item.content;
                return (
                  <Link key={idx} to={post.metadata.permalink} className={styles.postCard}>
                    {post.metadata.frontMatter.image && (
                      <div className={styles.postImage}>
                        <img src={post.metadata.frontMatter.image} alt={post.metadata.title} />
                      </div>
                    )}
                    <div className={styles.postContent}>
                      {post.metadata.tags?.[0] && (
                        <span className={styles.postTag}>
                          {formatTagLabel(post.metadata.tags[0].label)}
                        </span>
                      )}
                      <h3 className={styles.postTitle}>{post.metadata.title}</h3>
                      <p className={styles.postDescription}>
                        {post.metadata.description}
                      </p>
                      <div className={styles.postMeta}>
                        {post.metadata.authors?.[0]?.name} · {' '}
                        {new Date(post.metadata.date).toLocaleDateString()}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <BlogListPaginator metadata={metadata} />
    </BlogLayout>
  );
}

export default function BlogListPage(props: Props): JSX.Element {
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
