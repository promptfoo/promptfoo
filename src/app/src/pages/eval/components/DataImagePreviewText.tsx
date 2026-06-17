import type { ReactNode } from 'react';

import MarkdownImage from './MarkdownImage';
import { isImageDataUrl, type RenderableMarkdownImage } from './markdown-config';

interface DataImagePreviewTextProps {
  images: RenderableMarkdownImage[];
  imageClassName?: string;
  onImageClick?: (src: string) => void;
  text: string;
}

/** Replace only parsed data-image tokens while preserving all surrounding text literally. */
export default function DataImagePreviewText({
  images,
  imageClassName,
  onImageClick,
  text,
}: DataImagePreviewTextProps) {
  const content: ReactNode[] = [];
  let cursor = 0;

  for (const image of images) {
    if (
      !isImageDataUrl(image.source) ||
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
        className={imageClassName}
        onImageClick={onImageClick}
      />,
    );
    cursor = image.end;
  }

  content.push(text.slice(cursor));
  return <span className="whitespace-pre-wrap">{content}</span>;
}
