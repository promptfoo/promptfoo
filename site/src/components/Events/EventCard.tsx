import React from 'react';

import Link from '@docusaurus/Link';
import { formatEventDate, formatEventLocation } from '../../data/events';
import styles from './EventCard.module.css';

import type { Event } from '../../data/events';

interface EventCardProps {
  event: Event;
}

export default function EventCard({ event }: EventCardProps): React.ReactElement {
  // All events are linkable - either to their custom page or the events listing with hash
  const eventUrl = event.customPageUrl || `/events#${event.id}`;

  const CardContent = () => (
    <>
      {/* Image */}
      <div className={styles.imageContainer}>
        {event.cardImage ? (
          <img src={event.cardImage} alt={event.name} className={styles.image} loading="lazy" />
        ) : (
          <div className={styles.placeholderImage}>
            <span className={styles.placeholderIcon}>
              {event.type === 'conference' ? '🎪' : event.type === 'party' ? '🎉' : '📅'}
            </span>
          </div>
        )}
        <span className={`${styles.badge} ${styles[event.status]}`}>
          {event.status === 'upcoming' ? 'Upcoming' : 'Past'}
        </span>
      </div>

      {/* Content */}
      <div className={styles.content}>
        <h3 className={styles.name}>{event.shortName}</h3>

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
        </div>

        <p className={styles.description}>{event.description}</p>

        <span className={styles.cta}>
          View event
          <svg
            className={styles.ctaIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M9 5l7 7-7 7" />
          </svg>
        </span>
      </div>
    </>
  );

  return (
    <Link to={eventUrl} className={styles.card}>
      <CardContent />
    </Link>
  );
}
