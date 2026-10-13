import { createContext, use } from 'react';
import type { ComponentProps } from 'react';

import type { ExtraProps } from 'react-markdown';

const MarkdownLinkContext = createContext(false);

/** Keep linked images non-interactive so their enclosing Markdown link owns navigation. */
export function MarkdownImageLink({
  children,
  node: _node,
  ...props
}: ComponentProps<'a'> & ExtraProps) {
  return (
    <a {...props}>
      <MarkdownLinkContext value={true}>{children}</MarkdownLinkContext>
    </a>
  );
}

interface MarkdownImageProps {
  src?: string;
  alt?: string;
  title?: string;
  className?: string;
  onImageClick?: (src: string) => void;
}

export default function MarkdownImage({
  src,
  alt,
  title,
  className,
  onImageClick,
}: MarkdownImageProps) {
  const isLinked = use(MarkdownLinkContext);
  if (!src) {
    return alt ? <span>{alt}</span> : null;
  }

  const image = (
    <img src={src} alt={alt || ''} title={title} loading="lazy" className={className} />
  );
  if (!onImageClick || isLinked) {
    return image;
  }

  return (
    <button
      type="button"
      className="inline-block max-w-full cursor-pointer border-0 bg-transparent p-0 align-middle"
      aria-label={alt ? `Open image preview: ${alt}` : 'Open image preview'}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onImageClick(src);
      }}
    >
      {image}
    </button>
  );
}
