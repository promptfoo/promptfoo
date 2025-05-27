import React, { useState } from 'react';
import { useLocation } from '@docusaurus/router';
import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import styles from './CopyPageButton.module.css';

const getMarkdownUrl = (pathname: string) => {
  // Extract the path and map to the new markdown directory structure
  let docPath = pathname.replace(/^\/docs\//, '').replace(/\/$/, '');
  if (!docPath) {
    docPath = 'index';
  }

  // Use .md extension regardless of original file type
  // Files are now in /markdown/ directory instead of /docs/
  return `/markdown/${docPath}.md`;
};

const fetchMarkdown = async (pathname: string) => {
  const url = getMarkdownUrl(pathname);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error('Not found');
    }
    return await res.text();
  } catch {
    return 'Markdown source not available.';
  }
};

const CopyPageButton: React.FC = () => {
  const location = useLocation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (copied) {
      return;
    }

    const md = await fetchMarkdown(location.pathname);
    try {
      await navigator.clipboard.writeText(md);

      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch {
      // Handle copy failure if needed
    }
  };

  return (
    <div className={styles.buttonContainer}>
      <button
        onClick={handleCopy}
        aria-label={copied ? 'Copied markdown to clipboard' : 'Copy markdown to clipboard'}
        aria-live="polite"
        className={styles.copyButton}
      >
        <span className={`${styles.iconContainer} ${copied ? styles.copied : ''}`}>
          <ContentCopyIcon className={styles.copyIcon} />
          <CheckIcon className={styles.checkIcon} />
        </span>
      </button>
    </div>
  );
};

export default CopyPageButton;
