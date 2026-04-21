import React, { useState } from 'react';

import CodeBlock from '@theme/CodeBlock';
import styles from './styles.module.css';

interface FileDefinition {
  name: string;
  content: string;
  description?: string;
}

interface PythonFileViewerProps {
  files: FileDefinition[];
  defaultOpen?: string;
}

export default function PythonFileViewer({
  files,
  defaultOpen,
}: PythonFileViewerProps): React.ReactElement {
  const [activeFile, setActiveFile] = useState<string | null>(defaultOpen || null);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.headerLabel}>View source</span>
        <div className={styles.tabs}>
          {files.map((file) => (
            <button
              key={file.name}
              className={`${styles.tab} ${activeFile === file.name ? styles.active : ''}`}
              onClick={() => setActiveFile(activeFile === file.name ? null : file.name)}
              title={file.description}
              type="button"
            >
              {file.name}
            </button>
          ))}
        </div>
      </div>
      {activeFile && (
        <div className={styles.codeContainer}>
          <CodeBlock language="python">
            {files.find((f) => f.name === activeFile)?.content || ''}
          </CodeBlock>
        </div>
      )}
    </div>
  );
}
