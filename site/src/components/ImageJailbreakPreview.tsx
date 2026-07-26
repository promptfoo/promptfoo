import React, { useState } from 'react';

import styles from './ImageJailbreakPreview.module.css';

interface ImageJailbreakPreviewProps {
  title: string;
  images: { src: string; caption: string }[];
}

const ImageJailbreakPreview: React.FC<ImageJailbreakPreviewProps> = ({ title, images }) => {
  const [flipped, setFlipped] = useState(false);

  const handleClick = () => {
    setFlipped(!flipped);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setFlipped((current) => !current);
    }
  };

  return (
    <div
      className={`${styles.container} ${flipped ? styles.flipped : ''}`}
      role="button"
      tabIndex={0}
      aria-expanded={flipped}
      aria-label={`${flipped ? 'Hide' : 'Reveal'} jailbreak images for: ${title}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {!flipped && (
        <>
          <h3 className={styles.title}>{title}</h3>
          {images.length > 0 && (
            <div className={styles.imageWrapper}>
              <img
                src={images[0].src}
                alt={images[0].caption}
                className={`${styles.image} no-zoom`}
              />
            </div>
          )}
        </>
      )}
      {flipped &&
        images.map((image, index) => (
          <div key={index} className={styles.imageWrapper}>
            <img
              loading="lazy"
              src={image.src}
              alt={image.caption}
              className={`${styles.image} no-zoom`}
            />
            <p className={styles.caption}>
              <strong>Dall-E refused prompt:</strong> {title}
              <br />
              <br />
              <strong>Jailbreak prompt:</strong> {image.caption}
            </p>
          </div>
        ))}
    </div>
  );
};

export default ImageJailbreakPreview;
