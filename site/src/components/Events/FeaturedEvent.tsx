import React from 'react';

import Link from '@docusaurus/Link';
import { formatEventDate, formatEventLocation } from '../../data/events';
import styles from './FeaturedEvent.module.css';

import type { Event } from '../../data/events';

interface FeaturedEventProps {
  event: Event;
}

export default function FeaturedEvent({ event }: FeaturedEventProps): React.ReactElement {
  const hasExistingPage = Boolean(event.customPageUrl);
  const eventUrl = event.customPageUrl || `/events/${event.slug}`;

  return (
    <section className={styles.featured}>
      <div className={styles.container}>
        <div className={styles.content}>
          <span className={styles.badge}>Upcoming Event</span>

          <h2 className={styles.title}>{event.name}</h2>

          <div className={styles.meta}>
            <div className={styles.metaItem}>
              <svg
                className={styles.icon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{formatEventDate(event.startDate, event.endDate)}</span>
            </div>

            <div className={styles.metaItem}>
              <svg
                className={styles.icon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>{formatEventLocation(event.location)}</span>
            </div>

            {event.booth && (
              <div className={styles.metaItem}>
                <svg
                  className={styles.icon}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <span>{event.booth}</span>
              </div>
            )}
          </div>

          <p className={styles.description}>{event.fullDescription || event.description}</p>

          <div className={styles.buttons}>
            {hasExistingPage ? (
              <Link to={eventUrl} className={styles.primaryButton}>
                View event details
                <svg
                  className={styles.buttonIcon}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ) : event.registrationUrl ? (
              <a
                href={event.registrationUrl}
                className={styles.primaryButton}
                target="_blank"
                rel="noopener noreferrer"
              >
                Register now
                <svg
                  className={styles.buttonIcon}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </a>
            ) : event.meetingUrl ? (
              <a
                href={event.meetingUrl}
                className={styles.primaryButton}
                target="_blank"
                rel="noopener noreferrer"
              >
                Book a meeting
                <svg
                  className={styles.buttonIcon}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </a>
            ) : (
              <Link to="/contact" className={styles.primaryButton}>
                Get in touch
                <svg
                  className={styles.buttonIcon}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            )}
          </div>
        </div>

        <div className={styles.imageWrapper}>
          <div className={styles.imageContainer}>
            {event.heroImage ? (
              <img src={event.heroImage} alt={event.name} className={styles.image} />
            ) : (
              <div className={styles.placeholderImage}>
                <span className={styles.placeholderIcon}>
                  {event.type === 'conference' ? '🎪' : event.type === 'party' ? '🎉' : '📅'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
