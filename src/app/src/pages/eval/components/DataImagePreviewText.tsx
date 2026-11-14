import { Children, isValidElement, type ReactNode } from 'react';

import MarkdownImage from './MarkdownImage';
import { isInlineDataImage, type RenderableMarkdownImage } from './markdown-config';
import TruncatedText from './TruncatedText';

interface DataImagePreviewTextProps {
  images: RenderableMarkdownImage[];
  imageClassName?: string;
  maxTextLength?: number;
  onImageClick?: (src: string) => void;
  text: string;
  renderAfter?: (visibleImageSources: string[]) => ReactNode;
}

/** Replace only parsed data-image tokens while preserving all surrounding text literally. */
export default function DataImagePreviewText({
  images,
  imageClassName,
  maxTextLength = 0,
  onImageClick,
  text,
  renderAfter,
}: DataImagePreviewTextProps) {
  const content: ReactNode[] = [];
  let cursor = 0;

  for (const image of images) {
    if (
      !isInlineDataImage(image) ||
      image.start < cursor ||
      image.end <= image.start ||
      image.end > text.length
    ) {
      continue;
    }

    content.push(text.slice(cursor, image.start));
    content.push(
      <MarkdownImage
        key={`image-${image.start}-${image.end}`}
        src={image.source}
        alt={image.alt}
        title={image.title}
        className={imageClassName}
        onImageClick={onImageClick}
      />,
    );
    cursor = image.end;
  }

  content.push(text.slice(cursor));
  const preview = <span className="whitespace-pre-wrap">{content}</span>;
  const renderAfterPreview = renderAfter
    ? (visibleText: ReactNode) => {
        const sources: string[] = [];
        const collectSources = (node: ReactNode) => {
          Children.forEach(node, (child) => {
            if (!isValidElement<{ src?: string; children?: ReactNode }>(child)) {
              return;
            }
            if (child.type === MarkdownImage && child.props.src) {
              sources.push(child.props.src);
            } else {
              collectSources(child.props.children);
            }
          });
        };
        collectSources(visibleText);
        return renderAfter(sources);
      }
    : undefined;

  // Use the actual truncated tree so hidden previews do not suppress structured images.
  return maxTextLength > 0 ? (
    <TruncatedText text={preview} maxLength={maxTextLength} renderAfter={renderAfterPreview} />
  ) : (
    <>
      {preview}
      {renderAfterPreview?.(preview)}
    </>
  );
}
