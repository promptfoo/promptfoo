import React, { useEffect, useState } from 'react';

import Link from '@docusaurus/Link';
import { useLocation } from '@docusaurus/router';
import styles from './styles.module.css';

type EventBannerItem = {
  badge: string;
  cta: string;
  date: string;
  href: string;
  location: string;
};

const ACTIVE_EVENTS: EventBannerItem[] = [];

function getActiveEvents(): EventBannerItem[] {
  return ACTIVE_EVENTS;
}

export default function EventsBanner(): React.ReactElement | null {
  const [isVisible, setIsVisible] = useState(true);
  const location = useLocation();
  const activeEvents = getActiveEvents();
  const shouldShowBanner =
    activeEvents.length > 0 &&
    !activeEvents.some((event) => location.pathname.includes(event.href));

  useEffect(() => {
    if (!shouldShowBanner) {
      return;
    }

    const dismissed = sessionStorage.getItem('eventsBannerDismissed');
    if (dismissed === 'true') {
      setIsVisible(false);
    }
  }, [shouldShowBanner]);

  const handleDismiss = () => {
    setIsVisible(false);
    sessionStorage.setItem('eventsBannerDismissed', 'true');
  };

  if (!shouldShowBanner || !isVisible) {
    return null;
  }

  return (
    <div className={styles.banner}>
      <div className={styles.backgroundAnimation}>
        <div className={styles.particle1} />
        <div className={styles.particle2} />
        <div className={styles.particle3} />
      </div>

      <div className={styles.content}>
        <div className={styles.leftSection}>
          <span className={styles.megaphone} aria-hidden="true">
            !
          </span>
          <span className={styles.heading}>JOIN US AT</span>
        </div>

        <div className={styles.eventsContainer}>
          {activeEvents.map((event, index) => (
            <React.Fragment key={event.href}>
              {index > 0 && (
                <div className={styles.divider}>
                  <span className={styles.plus}>+</span>
                </div>
              )}

              <Link to={event.href} className={styles.eventCard}>
                <div className={styles.eventBadge}>{event.badge}</div>
                <div className={styles.eventDetails}>
                  <span className={styles.eventDate}>{event.date}</span>
                  <span className={styles.eventLocation}>{event.location}</span>
                </div>
                <span className={styles.eventCta}>{event.cta}</span>
              </Link>
            </React.Fragment>
          ))}
        </div>

        <button className={styles.closeButton} onClick={handleDismiss} aria-label="Dismiss banner">
          x
        </button>
      </div>

      <div className={styles.progressBar}>
        <div className={styles.progressFill} />
      </div>
    </div>
  );
}
