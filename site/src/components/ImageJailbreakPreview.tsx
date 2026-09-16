import React, { useId, useState } from 'react';

import styles from './ImageJailbreakPreview.module.css';

interface ImageJailbreakPreviewProps {
  title: string;
  images: { src: string; caption: string }[];
}

/**
 * Click-to-reveal card for jailbreak examples.
 *
 * The control is a real <button> and the revealed images live in a sibling region
 * rather than inside it. Descendants of an element with role="button" are flattened
 * in the accessibility tree and an explicit aria-label replaces them, so making the
 * whole card the button meant screen-reader users heard only "Hide jailbreak
 * images…" and could never reach the captions they had just revealed.
 *
 * A single toggle button serves both states: collapsed it is the full-card overlay,
 * expanded it is the inline "Hide" control. Rendering one persistent element (rather
 * than unmounting one button and mounting another) keeps the DOM node — and therefore
 * the user's focus — alive across the toggle. Swapping elements dropped focus to
 * <body>, restarting keyboard navigation at the top of the page.
 */
const ImageJailbreakPreview: React.FC<ImageJailbreakPreviewProps> = ({ title, images }) => {
  const [flipped, setFlipped] = useState(false);
  const panelId = useId();

  const toggle = () => setFlipped((current) => !current);

  return (
    <div className={`${styles.container} ${flipped ? styles.flipped : ''}`}>
      {/* Collapsed, this covers the blurred preview so the whole card is one focusable
          control; expanded, it is the inline "Hide" button. Same node either way. */}
      <button
        type="button"
        className={flipped ? styles.hideButton : styles.revealButton}
        aria-expanded={flipped}
        aria-controls={panelId}
        onClick={toggle}
      >
        {flipped ? 'Hide jailbreak images' : <span className={styles.title}>{title}</span>}
      </button>

      {!flipped && images.length > 0 && (
        <div className={styles.imageWrapper}>
          {/* Deliberately hidden content: the preview is decorative until revealed. */}
          <img src={images[0].src} alt="" className={`${styles.image} no-zoom`} />
        </div>
      )}

      <div id={panelId} hidden={!flipped}>
        {images.map((image) => (
          <div key={image.src} className={styles.imageWrapper}>
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
    </div>
  );
};

export default ImageJailbreakPreview;
