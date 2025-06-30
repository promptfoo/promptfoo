import React from 'react';
import { PageMetadata, HtmlClassNameProvider, ThemeClassNames } from '@docusaurus/theme-common';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import BlogPostGrid from '@site/src/components/Blog/BlogPostGrid';
import FeaturedBlogPost from '@site/src/components/Blog/FeaturedBlogPost';
import BlogLayout from '@theme/BlogLayout';
import type { Props } from '@theme/BlogListPage';
import BlogListPageStructuredData from '@theme/BlogListPage/StructuredData';
import BlogListPaginator from '@theme/BlogListPaginator';
import SearchMetadata from '@theme/SearchMetadata';
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

  // Determine appropriate title based on pagination
  const isFirstPage = metadata.page === 1;
  const gridTitle = isFirstPage ? 'Latest Posts' : `Archive • Page ${metadata.page}`;

  // Handle posts differently based on page
  let featuredPost = null;

  // Determine which posts to display in the grid
  const displayPosts = React.useMemo(() => {
    if (isFirstPage && items.length > 0) {
      // For the grid, take all remaining posts but ensure an even number for balanced layout
      const remainingPosts = items.slice(1);
      const evenCount =
        remainingPosts.length % 2 === 0 ? remainingPosts.length : remainingPosts.length - 1;

      return remainingPosts.slice(0, evenCount);
    }
    // For other pages, or if no items, just use all items
    return items;
  }, [isFirstPage, items]);

  // Set featured post if on first page
  if (isFirstPage && items.length > 0) {
    featuredPost = items[0];
  }

  return (
    <BlogLayout sidebar={sidebar}>
      <div className={styles.blogListPage}>
        {featuredPost && <FeaturedBlogPost post={featuredPost.content} />}
        <BlogPostGrid posts={displayPosts.map((item) => item.content)} title={gridTitle} />
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
