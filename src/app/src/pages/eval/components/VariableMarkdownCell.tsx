import React from 'react';

import ReactMarkdown from 'react-markdown';
import MarkdownErrorBoundary from './MarkdownErrorBoundary';
import { REMARK_PLUGINS } from './markdown-config';
import TruncatedText from './TruncatedText';

interface VariableMarkdownCellProps {
  value: string;
  maxTextLength: number;
}

/**
 * Memoized markdown cell component for variable columns in the results table.
 *
 * This component is memoized to prevent unnecessary re-renders when the parent
 * table re-renders due to layout changes (e.g., column visibility toggles).
 * It only re-renders when the actual content (value) or display settings change.
 *
 * Uses stable REMARK_PLUGINS constant to prevent prop instability.
 *
 * @see https://github.com/promptfoo/promptfoo/issues/969
 */
const VariableMarkdownCell = React.memo(function VariableMarkdownCell({
  value,
  maxTextLength,
}: VariableMarkdownCellProps) {
  return (
    <MarkdownErrorBoundary fallback={value}>
      <TruncatedText
        text={<ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{value}</ReactMarkdown>}
        maxLength={maxTextLength}
      />
    </MarkdownErrorBoundary>
  );
});

export default VariableMarkdownCell;
