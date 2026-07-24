import React from 'react';

import ReactMarkdown from 'react-markdown';
import DataImagePreviewText from './DataImagePreviewText';
import MarkdownErrorBoundary from './MarkdownErrorBoundary';
import MarkdownImage from './MarkdownImage';
import {
  extractRenderableMarkdownImages,
  IMAGE_DATA_URL_TRANSFORM,
  isInlineDataImage,
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
      img: ({ src, alt }: { src?: string; alt?: string }) => (
        <MarkdownImage
          src={src}
          alt={alt}
          onImageClick={onImageClick}
          className="max-h-48 max-w-full object-contain"
        />
      ),
    }),
    [onImageClick],
  );
  const renderableMarkdownImages = React.useMemo(
    () => (value.includes('![') ? extractRenderableMarkdownImages(value) : []),
    [value],
  );
  const dataImages = React.useMemo(
    () => renderableMarkdownImages.filter(isInlineDataImage),
    [renderableMarkdownImages],
  );
  const hasRenderedImage = dataImagesOnly
    ? dataImages.length > 0
    : renderableMarkdownImages.length > 0;

  return (
    <MarkdownErrorBoundary fallback={value}>
      <TruncatedText
        text={
          dataImagesOnly && dataImages.length > 0 ? (
            <DataImagePreviewText
              text={value}
              images={dataImages}
              imageClassName="max-h-48 max-w-full object-contain"
              onImageClick={onImageClick}
            />
          ) : dataImagesOnly ? (
            value
          ) : (
            <ReactMarkdown
              components={markdownComponents}
              remarkPlugins={REMARK_PLUGINS}
              urlTransform={IMAGE_DATA_URL_TRANSFORM}
            >
              {value}
            </ReactMarkdown>
          )
        }
        maxLength={hasRenderedImage ? 0 : maxTextLength}
      />
    </MarkdownErrorBoundary>
  );
});

export default VariableMarkdownCell;
