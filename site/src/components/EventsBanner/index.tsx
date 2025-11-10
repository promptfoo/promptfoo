import React, { useState, useEffect } from 'react';
import Link from '@docusaurus/Link';
import { useLocation } from '@docusaurus/router';
import styles from './styles.module.css';

export default function EventsBanner(): JSX.Element | null {
  // No events currently scheduled.
  return null;

  const [isVisible, setIsVisible] = useState(true);
  const location = useLocation();

  // Don't show banner on event pages themselves
  if (
    location.pathname.includes('/events/blackhat-2025') ||
    location.pathname.includes('/events/defcon-2025')
  ) {
    return null;
  }

  // Check if user has dismissed the banner in this session
  useEffect(() => {
    const dismissed = sessionStorage.getItem('eventsBannerDismissed');
    if (dismissed === 'true') {
      setIsVisible(false);
    }
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    sessionStorage.setItem('eventsBannerDismissed', 'true');
  };

  if (!isVisible) return null;

  return (
    <div className={styles.banner}>
      <div className={styles.backgroundAnimation}>
        <div className={styles.particle1} />
        <div className={styles.particle2} />
        <div className={styles.particle3} />
      </div>

      <div className={styles.content}>
        <div className={styles.leftSection}>
          <span className={styles.megaphone}>📢</span>
          <span className={styles.heading}>JOIN US AT</span>
        </div>

        <div className={styles.eventsContainer}>
          <Link to="/events/blackhat-2025" className={styles.eventCard}>
            <div className={styles.eventBadge}>BLACK HAT USA</div>
            <div className={styles.eventDetails}>
              <span className={styles.eventDate}>AUG 5-7</span>
              <span className={styles.eventLocation}>BOOTH #4712</span>
            </div>
            <span className={styles.eventCta}>BOOK DEMO →</span>
          </Link>

          <div className={styles.divider}>
            <span className={styles.plus}>+</span>
          </div>

          <Link to="/events/defcon-2025" className={styles.eventCard}>
            <div className={styles.eventBadge}>DEFCON 33</div>
            <div className={styles.eventDetails}>
              <span className={styles.eventDate}>AUG 9</span>
              <span className={styles.eventLocation}>PARTY</span>
            </div>
            <span className={styles.eventCta}>RSVP →</span>
          </Link>
        </div>

        <button className={styles.closeButton} onClick={handleDismiss} aria-label="Dismiss banner">
          ×
        </button>
      </div>

      <div className={styles.progressBar}>
        <div className={styles.progressFill} />
      </div>
    </div>
  );
}
