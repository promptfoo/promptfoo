import React, { useState } from 'react';
import { useLocation } from '@docusaurus/router';
import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

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
    <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
      <button
        onClick={handleCopy}
        style={{
          display: 'flex',
          alignItems: 'center',
          border: '1px solid #e5e7eb',
          borderRadius: '18px',
          background: '#fff',
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
          padding: '0 14px',
          fontSize: 15,
          fontWeight: 500,
          cursor: 'pointer',
          height: 36,
          minWidth: 110, // Fixed minimum width instead of dynamic measurement
        }}
        aria-label="Copy page as markdown"
      >
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <span
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 18,
              height: 18,
            }}
          >
            <ContentCopyIcon
              style={{
                fontSize: 14,
                opacity: copied ? 0 : 1,
                position: 'absolute',
                transition: 'all 0.2s ease-in-out',
              }}
            />
            <CheckIcon
              style={{
                fontSize: 14,
                opacity: copied ? 1 : 0,
                position: 'absolute',
                color: '#22c55e',
                transition: 'all 0.2s ease-in-out',
              }}
            />
          </span>
          <span>Copy page</span>
        </span>
      </button>
    </div>
  );
};

export default CopyPageButton;
