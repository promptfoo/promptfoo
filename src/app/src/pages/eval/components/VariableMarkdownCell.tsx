import React from 'react';

import { cn } from '@app/lib/utils';
import ReactMarkdown from 'react-markdown';
import MarkdownErrorBoundary from './MarkdownErrorBoundary';
import {
  DATA_IMAGE_ONLY_URL_TRANSFORM,
  extractRenderableMarkdownImageSources,
  IMAGE_DATA_URL_TRANSFORM,
  isImageDataUrl,
  REMARK_PLUGINS,
} from './markdown-config';
import TruncatedText from './TruncatedText';

interface VariableMarkdownCellProps {
  value: string;
  maxTextLength: number;
  dataImagesOnly?: boolean;
  onImageClick?: (src?: string) => void;
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
  dataImagesOnly = false,
  onImageClick,
}: VariableMarkdownCellProps) {
  const markdownComponents = React.useMemo(
    () => ({
      img: ({ src, alt }: { src?: string; alt?: string }) =>
        src ? (
          <img
            src={src}
            alt={alt || ''}
            loading="lazy"
            onClick={() => onImageClick?.(src)}
            className={cn('max-h-48 max-w-full object-contain', onImageClick && 'cursor-pointer')}
          />
        ) : null,
    }),
    [onImageClick],
  );
  const renderableMarkdownImageSources = React.useMemo(
    () => (value.includes('![') ? extractRenderableMarkdownImageSources(value) : []),
    [value],
  );
  const shouldRenderMarkdown =
    !dataImagesOnly || renderableMarkdownImageSources.some(isImageDataUrl);

  return (
    <MarkdownErrorBoundary fallback={value}>
      <TruncatedText
        text={
          shouldRenderMarkdown ? (
            <ReactMarkdown
              components={markdownComponents}
              remarkPlugins={REMARK_PLUGINS}
              urlTransform={
                dataImagesOnly ? DATA_IMAGE_ONLY_URL_TRANSFORM : IMAGE_DATA_URL_TRANSFORM
              }
            >
              {value}
            </ReactMarkdown>
          ) : (
            value
          )
        }
        maxLength={
          shouldRenderMarkdown && renderableMarkdownImageSources.length > 0 ? 0 : maxTextLength
        }
      />
    </MarkdownErrorBoundary>
  );
});

export default VariableMarkdownCell;
