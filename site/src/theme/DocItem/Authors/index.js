import React from 'react';
import { useDoc } from '@docusaurus/plugin-content-docs/client';
import authorsData from '@site/blog/authors.json';
import styles from './styles.module.css';

export default function DocItemAuthors() {
  const { frontMatter } = useDoc();
  let { authors } = frontMatter;

  if (!authors) {
    return null;
  }

  if (typeof authors === 'string') {
    authors = [authors];
  }

  const resolvedAuthors = authors
    .map((authorKeyOrObj) => {
      if (typeof authorKeyOrObj === 'string') {
        const authorInfo = authorsData[authorKeyOrObj];
        if (!authorInfo) {
          console.warn(`No author data found for key '${authorKeyOrObj}' in authors.json`);
          return null;
        }
        return {
          name: authorInfo.name,
          title: authorInfo.title,
          url: authorInfo.url,
          imageURL: authorInfo.image_url,
          description: authorInfo.description,
        };
      } else {
        const { name, title, url, image_url, imageURL, description } = authorKeyOrObj;
        return {
          name,
          title,
          url,
          imageURL: imageURL || image_url,
          description,
        };
      }
    })
    .filter(Boolean);

  if (resolvedAuthors.length === 0) {
    return null;
  }

  return (
    <div className={`${styles.docAuthors} margin-bottom--md`}>
      {resolvedAuthors.map((author, index) => {
        const { name, title, url, imageURL, description } = author;
        return (
          <div key={index} className={styles.docAuthor}>
            {imageURL && <img src={imageURL} alt={name} className={styles.docAuthorImg} />}
            <div className={styles.docAuthorContent}>
              <div className={styles.docAuthorName}>
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    {name}
                  </a>
                ) : (
                  name
                )}
              </div>
              {title && <div className={styles.docAuthorTitle}>{title}</div>}
              {description && <div className={styles.docAuthorDesc}>{description}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
