import React, { useMemo, useState } from 'react';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import './FailReasonCarousel.css';
import DataImagePreviewText from './DataImagePreviewText';
import MarkdownErrorBoundary from './MarkdownErrorBoundary';
import MarkdownImage, { MarkdownImageLink } from './MarkdownImage';
import {
  extractRenderableMarkdownImages,
  isImageDataUrl,
  isInlineDataImage,
  PRESERVE_IMAGE_URL_TRANSFORM,
  REMARK_PLUGINS,
} from './markdown-config';

interface FailReasonCarouselProps {
  failReasons: string[];
  renderMarkdown: boolean;
  onImageClick?: (src?: string) => void;
}

const FailReasonCarousel = ({
  failReasons,
  renderMarkdown,
  onImageClick,
}: FailReasonCarouselProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const normalizedCurrentIndex = failReasons.length > 0 ? currentIndex % failReasons.length : 0;
  const currentReason = failReasons[normalizedCurrentIndex] ?? '';
  const markdownReason = currentReason;
  const markdownComponents = useMemo<React.ComponentProps<typeof ReactMarkdown>['components']>(
    () => ({
      a: MarkdownImageLink,
      img: ({ src, alt, title, node }) =>
        src && isImageDataUrl(src) ? (
          <MarkdownImage
            src={src}
            alt={alt}
            title={title}
            onImageClick={onImageClick}
            className="mt-2 block max-h-48 max-w-full object-contain"
          />
        ) : (
          <span>
            {/* Parsed inline image tokens end in ')'; references end in ']'. Keep inline
                spelling verbatim, but expand references so their definition titles remain visible. */}
            {typeof node?.position?.start.offset === 'number' &&
            typeof node.position.end.offset === 'number' &&
            markdownReason.slice(node.position.start.offset, node.position.end.offset).endsWith(')')
              ? markdownReason.slice(node.position.start.offset, node.position.end.offset)
              : `![${alt ?? ''}](${src ?? ''}${title == null ? '' : ` ${JSON.stringify(title)}`})`}
          </span>
        ),
      p: ({ children }) => <p className="m-0">{children}</p>,
    }),
    [onImageClick, markdownReason],
  );
  const dataImages = useMemo(
    () =>
      !renderMarkdown && currentReason.includes('![')
        ? extractRenderableMarkdownImages(currentReason).filter(isInlineDataImage)
        : [],
    [currentReason, renderMarkdown],
  );

  if (failReasons.length < 1) {
    return null;
  }

  const handlePrev = () => {
    setCurrentIndex((prevIndex) => (prevIndex > 0 ? prevIndex - 1 : failReasons.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prevIndex) => (prevIndex + 1) % failReasons.length);
  };

  return (
    <div className="fail-reason">
      {failReasons.length > 1 && (
        <span className="fail-reason-carousel-controls">
          <button
            type="button"
            onClick={handlePrev}
            className="p-1 rounded hover:bg-muted transition-colors"
          >
            <ChevronLeft className="size-3" />
          </button>
          <span>
            {normalizedCurrentIndex + 1}/{failReasons.length}
          </span>
          <button
            type="button"
            onClick={handleNext}
            className="p-1 rounded hover:bg-muted transition-colors"
          >
            <ChevronRight className="size-3" />
          </button>
        </span>
      )}
      {currentReason && renderMarkdown ? (
        <MarkdownErrorBoundary fallback={currentReason}>
          <div className="whitespace-pre-wrap">
            <ReactMarkdown
              components={markdownComponents}
              remarkPlugins={REMARK_PLUGINS}
              urlTransform={PRESERVE_IMAGE_URL_TRANSFORM}
            >
              {markdownReason}
            </ReactMarkdown>
          </div>
        </MarkdownErrorBoundary>
      ) : currentReason && dataImages.length > 0 ? (
        <MarkdownErrorBoundary fallback={currentReason}>
          <DataImagePreviewText
            text={currentReason}
            images={dataImages}
            imageClassName="mt-2 block max-h-48 max-w-full object-contain"
            onImageClick={onImageClick}
          />
        </MarkdownErrorBoundary>
      ) : (
        currentReason
          ?.trim()
          .split('\n')
          .map((line, index) => (
            <React.Fragment key={index}>
              {line}
              <br />
            </React.Fragment>
          ))
      )}
    </div>
  );
};

export default FailReasonCarousel;
