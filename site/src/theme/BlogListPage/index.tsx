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
  const featuredPost = items[0];
  const otherPosts = items.slice(1);

  return (
    <BlogLayout sidebar={sidebar}>
      <div className={styles.blogListPage}>
        <FeaturedBlogPost post={featuredPost.content} />
        <BlogPostGrid posts={otherPosts.map((item) => item.content)} />
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
