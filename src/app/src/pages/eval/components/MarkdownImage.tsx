interface MarkdownImageProps {
  src?: string;
  alt?: string;
  className?: string;
  onImageClick?: (src: string) => void;
}

export default function MarkdownImage({ src, alt, className, onImageClick }: MarkdownImageProps) {
  if (!src) {
    return null;
  }

  const image = <img src={src} alt={alt || ''} loading="lazy" className={className} />;
  if (!onImageClick) {
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
