import React, { useState } from 'react';
import styles from './CollapsibleCode.module.css';

interface CollapsibleCodeProps {
  title: string;
  language?: string;
  code: string;
  defaultExpanded?: boolean;
}

export default function CollapsibleCode({
  title,
  language = 'yaml',
  code,
  defaultExpanded = false,
}: CollapsibleCodeProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [showCopied, setShowCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(code);
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 2000);
  };

  const previewLines = code.split('\n').slice(0, 3).join('\n');
  const hasMoreLines = code.split('\n').length > 3;

  return (
    <div className={styles.collapsibleCode}>
      <div className={styles.header} onClick={() => setIsExpanded(!isExpanded)}>
        <span className={styles.title}>
          <span className={styles.icon}>{isExpanded ? '▼' : '▶'}</span>
          {title}
        </span>
        <div className={styles.actions}>
          {!isExpanded && hasMoreLines && (
            <span className={styles.lineCount}>{code.split('\n').length} lines</span>
          )}
          <span className={styles.expandText}>{isExpanded ? 'Collapse' : 'Expand'}</span>
        </div>
      </div>

      <div className={`${styles.codeContainer} ${isExpanded ? styles.expanded : ''}`}>
        {!isExpanded && hasMoreLines ? (
          <div className={styles.preview}>
            <pre>
              <code className={`language-${language}`}>{previewLines}</code>
            </pre>
            <div className={styles.fade} onClick={() => setIsExpanded(true)}>
              <span className={styles.expandHint}>Click to expand full code...</span>
            </div>
          </div>
        ) : (
          <div className={styles.fullCode}>
            <div className={styles.codeHeader}>
              <span className={styles.language}>{language.toUpperCase()}</span>
              <button
                className={styles.copyButton}
                onClick={(e) => {
                  e.stopPropagation();
                  copyToClipboard();
                }}
              >
                {showCopied ? '✅ Copied!' : '📋 Copy'}
              </button>
            </div>
            <pre>
              <code className={`language-${language}`}>{code}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
