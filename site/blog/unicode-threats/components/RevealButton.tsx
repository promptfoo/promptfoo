import React, { useState } from 'react';
import styles from '../styles/RevealButton.module.css';

const RevealButton: React.FC = () => {
  const [isRevealed, setIsRevealed] = useState(false);

  const handleReveal = () => {
    setIsRevealed(!isRevealed);
    // Find the paragraph with hidden text and reveal/hide Unicode
    const paragraph = document.querySelector('[data-hidden-unicode]');
    if (paragraph) {
      paragraph.classList.toggle(styles.revealed);
    }
  };

  return (
    <div className={styles.container}>
      <button
        className={`${styles.button} ${isRevealed ? styles.active : ''}`}
        onClick={handleReveal}
      >
        <span className={styles.buttonText}>
          {isRevealed ? 'Hide Unicode' : 'Reveal Hidden Message'}
        </span>
        <span className={styles.icon}>{isRevealed ? '👁️' : '👁️‍🗨️'}</span>
      </button>
      {isRevealed && (
        <div className={styles.infoBox}>
          <p>Hidden Unicode characters detected! These invisible characters encode binary data:</p>
          <pre className={styles.unicodeInfo}>
            Found: U+200B (Zero Width Space) - Start marker{'\n'}
            U+200C (Zero Width Non-Joiner) - Binary 0{'\n'}
            U+2063 (Invisible Separator) - Binary 1{'\n'}
            U+200D (Zero Width Joiner) - End marker
          </pre>
        </div>
      )}
    </div>
  );
};

export default RevealButton;
